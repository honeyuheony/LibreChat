const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const {
  createImportHandler,
  createForkSkillHandler,
  createSkillExportHandler,
  skillExportLimits,
  blockFilteredSkillFile,
  generateCheckAccess,
  getStorageMetadata,
  resolveRequestTenantId,
  restoreTenantContextFromReq,
  createSkillCategoriesHandler,
  markSkillReviewed,
  clearSkillReview,
  createSkillDraftHandler,
  createSkillPublishHandler,
  createSkillTestResultHandler,
  createDefaultAgentLLMFactory,
  createDepartmentGroups,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  PermissionBits,
  PermissionTypes,
  Permissions,
  FileContext,
  mergeFileConfig,
} = require('librechat-data-provider');
const {
  createSkill,
  getSkillById,
  deleteSkill,
  upsertSkillFile,
  getSkillFileByPath,
  getRoleByName,
  listSkillsByAccess,
  updateSkillReview,
  getAgent,
  getConvo,
  getUserKey,
  getMessages,
  getUserKeyValues,
  getAuthorSkillByName,
  findEntriesByResource,
  setSkillPublicationState,
  getSkillAuthorDepartments,
} = require('~/models');
const db = require('~/models');
const checkAdmin = require('~/server/middleware/roles/admin');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const {
  grantPermission,
  hasPublicPermission,
  findAccessibleResources,
  bulkUpdateResourcePermissions,
  findPubliclyAccessibleResources,
} = require('~/server/services/PermissionService');
const sharePolicy = require('~/server/middleware/checkSharePublicAccess');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { createFileLimiters } = require('~/server/middleware/limiters/uploadLimiters');
const { createDraftLimiters } = require('~/server/middleware/limiters/draftLimiters');
const { maybeRunGitHubSkillSyncForRequest } = require('~/server/services/Skills/sync');
const {
  getSkillDbMethods,
  getSkillStrategyFunctions,
} = require('~/server/services/Endpoints/agents/skillDeps');
const configMiddleware = require('~/server/middleware/config/app');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer: memory storage for skill imports (zip processed in-memory)
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.md', '.zip', '.skill']);
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB

const memoryStorage = multer.memoryStorage();

function getSkillImportSizeLimit(req) {
  const fileConfig = mergeFileConfig(req.config?.fileConfig);
  return fileConfig.skills?.fileSizeLimit ?? MAX_IMPORT_SIZE;
}

const skillImportFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    // N.B. The error handler at the bottom of this file matches this "Only " prefix.
    cb(new Error('Only .md, .zip, and .skill files are allowed'), false);
  }
};

const skillUpload = (req, res, next) =>
  multer({
    storage: memoryStorage,
    fileFilter: skillImportFilter,
    limits: { fileSize: getSkillImportSizeLimit(req) },
  }).single('file')(req, res, next);

// Per-file upload (for adding individual files to an existing skill)
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const singleFileUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_SINGLE_FILE_SIZE },
});

// ---------------------------------------------------------------------------
// Role-based capability gates
// ---------------------------------------------------------------------------
const checkSkillAccess = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSkillCreate = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

// ---------------------------------------------------------------------------
// Rate limiters (reuse existing file upload limiters)
// ---------------------------------------------------------------------------
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
const { draftIpLimiter, draftUserLimiter } = createDraftLimiters();

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkSkillAccess);

// ---------------------------------------------------------------------------
// CRUD handlers
// ---------------------------------------------------------------------------
const { getSkillsHandlers } = require('~/server/services/Skills/handlers');
const handlers = getSkillsHandlers();

// ---------------------------------------------------------------------------
// File storage helper: resolve the active strategy's saveBuffer
// ---------------------------------------------------------------------------
function resolveSkillStorage(req, { isImage = false } = {}) {
  const source = getFileStrategy(req.config, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { saveBuffer: strategy.saveBuffer, source };
}

function saveSkillBuffer(req, { userId, buffer, fileName, basePath, isImage, tenantId }) {
  const requestTenantId = tenantId ?? resolveRequestTenantId(req);
  const storage = resolveSkillStorage(req, { isImage });
  return storage
    .saveBuffer({ userId, buffer, fileName, basePath, tenantId: requestTenantId })
    .then((filepath) => ({
      filepath,
      source: storage.source,
      ...getStorageMetadata({ filepath, source: storage.source }),
    }));
}

function deleteSkillBlob(req, file) {
  const { deleteFile } = getStrategyFunctions(file.source);
  if (deleteFile) {
    return deleteFile(req, file);
  }
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// Import handler (zip/md/skill → create skill + files)
// ---------------------------------------------------------------------------
const importHandler = createImportHandler({
  limits: (req) => ({
    maxZipBytes: getSkillImportSizeLimit(req),
  }),
  createSkill,
  getSkillById,
  deleteSkill,
  upsertSkillFile,
  saveBuffer: saveSkillBuffer,
  deleteFile: deleteSkillBlob,
  grantPermission,
});

// ---------------------------------------------------------------------------
// 응용: 남의 스킬을 복사해 호출자 소유로 만든다
// ---------------------------------------------------------------------------
const skillDbMethods = getSkillDbMethods();
const forkHandler = createForkSkillHandler({
  getSkillById: skillDbMethods.getSkillById,
  listSkillFiles: skillDbMethods.listSkillFiles,
  getStrategyFunctions: getSkillStrategyFunctions,
  createSkill,
  deleteSkill,
  upsertSkillFile,
  saveBuffer: saveSkillBuffer,
  deleteFile: deleteSkillBlob,
  grantPermission,
});

// ---------------------------------------------------------------------------
// 편집기: AI 초안, 시험 기록, 게시
// ---------------------------------------------------------------------------
const draftHandler = createSkillDraftHandler({
  getDraftLLM: createDefaultAgentLLMFactory({ getAgent, db: { getUserKey, getUserKeyValues } }),
  getConvo,
  getMessages,
  getAuthorSkillByName,
});
const testResultHandler = createSkillTestResultHandler({
  getSkillById,
  setSkillPublicationState,
  getConvo,
  getMessages,
  hasPublicPermission,
});
const publishHandler = createSkillPublishHandler({
  getSkillById,
  setSkillPublicationState,
  findEntriesByResource,
  bulkUpdateResourcePermissions,
  sharePolicy,
  getSkillAuthorDepartments,
  departmentGroups: createDepartmentGroups(db),
});

// ---------------------------------------------------------------------------
// Per-file upload handler (add a single file to an existing skill)
// ---------------------------------------------------------------------------
async function uploadFileHandler(req, res) {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const skillId = req.params.id;
    const relativePath = req.body.relativePath;
    if (!relativePath) {
      return res.status(400).json({ error: 'relativePath is required in form body' });
    }
    if (relativePath.toUpperCase() === 'SKILL.MD') {
      return res.status(400).json({ error: 'SKILL.md is reserved; update the skill body instead' });
    }
    // Reject traversal, absolute paths, empty/dot segments — matches model-layer validator
    // so storage writes don't happen before DB rejects the path.
    if (
      !/^[a-zA-Z0-9._\-/]+$/.test(relativePath) ||
      /^\//.test(relativePath) ||
      relativePath.split('/').some((s) => s === '' || s === '.' || s === '..')
    ) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (
      blockFilteredSkillFile(req.config?.filters, res, {
        buffer: file.buffer,
        originalName: file.originalname,
        relativePath,
      })
    ) {
      return res;
    }

    const tenantId = resolveRequestTenantId(req);

    // Look up existing file before saving — needed to clean up old blob on replace
    const existingFile = await getSkillFileByPath(skillId, relativePath);

    const fileId = crypto.randomUUID();
    const filename = file.originalname;
    const storageFileName = `${fileId}__${filename}`;

    const isImage = (file.mimetype || '').startsWith('image/');
    const storage = resolveSkillStorage(req, { isImage });
    const filepath = await storage.saveBuffer({
      userId: req.user.id,
      buffer: file.buffer,
      fileName: storageFileName,
      basePath: 'uploads',
      tenantId,
    });
    const storageMetadata = getStorageMetadata({ filepath, source: storage.source });

    let result;
    try {
      result = await upsertSkillFile({
        skillId,
        relativePath,
        file_id: fileId,
        filename,
        filepath,
        ...storageMetadata,
        source: storage.source,
        mimeType: file.mimetype || 'application/octet-stream',
        bytes: file.size,
        isExecutable: false,
        author: req.user._id,
        tenantId,
      });
    } catch (dbError) {
      // Clean up the stored blob so it doesn't leak on DB failure
      try {
        const { deleteFile } = getStrategyFunctions(storage.source);
        if (deleteFile) {
          await deleteFile(req, { filepath, user: req.user.id, tenantId });
        }
      } catch (cleanupErr) {
        logger.error('[uploadFile] Failed to clean up orphaned blob:', cleanupErr);
      }
      throw dbError;
    }

    // Clean up old blob if this was a replace (different filepath means new storage object)
    if (existingFile && existingFile.filepath !== filepath) {
      const { deleteFile: delOld } = getStrategyFunctions(existingFile.source);
      if (delOld) {
        delOld(req, {
          filepath: existingFile.filepath,
          user: existingFile.author ?? req.user.id,
          tenantId: existingFile.tenantId ?? tenantId,
        }).catch((e) => logger.error('[uploadFile] Old blob cleanup failed:', e));
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === 'SKILL_FILE_VALIDATION_FAILED') {
      return res.status(400).json({ error: error.message });
    }
    logger.error('[uploadFile] Error:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function maybeStartRequestSkillSync(req, _res, next) {
  try {
    await maybeRunGitHubSkillSyncForRequest(req);
  } catch (error) {
    logger.error('[GET /skills] Failed to start request-scoped skill sync:', error);
  }
  next();
}

// Import: accepts .md / .zip / .skill via multipart
router.post(
  '/import',
  checkSkillCreate,
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  skillUpload,
  restoreTenantContextFromReq,
  importHandler,
);

// 마켓 탭의 분류별 개수. 스킬 id 로 잘못 잡히지 않도록 `/:id` 보다 먼저 등록한다.
const categoriesHandler = createSkillCategoriesHandler({
  findAccessibleResources,
  findPubliclyAccessibleResources,
  listSkillsByAccess,
});
router.get('/categories', categoriesHandler);

// 저장하지 않고 칸 제안만 돌려주므로 만들기 권한만 본다.
router.post('/draft', checkSkillCreate, draftIpLimiter, draftUserLimiter, draftHandler);

// 검수 표시(마켓 카드의 "검수됨" 배지). 관리자만 켜고 끌 수 있으며 배포 폴더 스킬은 DB 문서가
// 없어 대상이 아니다.
router.post('/:id/review', checkAdmin, async (req, res) => {
  try {
    await markSkillReviewed(
      { skillId: req.params.id, reviewerId: req.user.id },
      { updateSkillReview },
    );
    res.status(200).json({ reviewed: true });
  } catch (error) {
    logger.error('[skills] review failed', error);
    res.status(500).json({ error: 'Failed to mark skill as reviewed' });
  }
});
router.delete('/:id/review', checkAdmin, async (req, res) => {
  try {
    await clearSkillReview({ skillId: req.params.id }, { updateSkillReview });
    res.status(200).json({ reviewed: false });
  } catch (error) {
    logger.error('[skills] clear review failed', error);
    res.status(500).json({ error: 'Failed to clear skill review' });
  }
});

router.get('/', maybeStartRequestSkillSync, handlers.list);
router.post('/', checkSkillCreate, handlers.create);

router.get(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.get,
);

// 원본을 볼 수 있는 사용자라면 응용할 수 있다. 파일을 복사하므로 업로드 제한을 함께 건다.
// 사본은 비공개로 만들어지고, 공유·공개해야 원본의 응용 수에 들어간다.
router.post(
  '/:id/fork',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  restoreTenantContextFromReq,
  forkHandler,
);

router.post(
  '/:id/test-result',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  testResultHandler,
);

// 공유 대화상자(PUT /api/permissions)와 같은 규칙: ACL SHARE 는 여기서, 역할 SHARE·SHARE_PUBLIC 은 처리 함수가 본다.
router.post(
  '/:id/publish',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.SHARE }),
  publishHandler,
);

router.patch(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.patch,
);

router.delete(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.DELETE }),
  handlers.delete,
);

router.get(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.listFiles,
);

// 내보내기는 파일을 모두 읽으므로 권한 확인보다 먼저 요청 횟수를 센다.
router.get(
  '/:id/export',
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  createSkillExportHandler({
    getSkillById: skillDbMethods.getSkillById,
    listSkillFiles: skillDbMethods.listSkillFiles,
    getStrategyFunctions: getSkillStrategyFunctions,
    getLimits: skillExportLimits,
  }),
);

// Per-file upload (live — replaces 501 stub)
router.post(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  singleFileUpload.single('file'),
  restoreTenantContextFromReq,
  uploadFileHandler,
);

// Wildcard splat (`*relativePath`) captures nested skill paths (e.g.
// `references/guide.md`) whether the client sends an encoded `%2F` or a proxy
// has already decoded it to a literal slash. A single `:relativePath` segment
// 404s in the latter case, which is why nested files failed behind proxies.
router.get(
  '/:id/files/*relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.downloadFile,
);

router.delete(
  '/:id/files/*relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.deleteFile,
);

// Multer + file-filter error handler — surface as 400, forward everything else

router.use((err, _req, res, next) => {
  if (err && (err.name === 'MulterError' || err.message?.startsWith('Only '))) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
