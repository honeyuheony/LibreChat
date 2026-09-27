const express = require('express');
const mongoose = require('mongoose');
const { logger, MAX_SKILL_PACK_SKILLS } = require('@librechat/data-schemas');
const { generateCheckAccess } = require('@librechat/api');
const {
  PermissionBits,
  PermissionTypes,
  Permissions,
  ResourceType,
} = require('librechat-data-provider');
const {
  createSkillPack,
  listSkillPacks,
  getSkillPackById,
  deleteSkillPack,
  getRoleByName,
} = require('~/models');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
} = require('~/server/services/PermissionService');
const { requireJwtAuth } = require('~/server/middleware');
const configMiddleware = require('~/server/middleware/config/app');

function serializeSkillPack(pack, skillIds) {
  const serializedPack = {
    _id: pack._id,
    name: pack.name,
    slug: pack.slug,
    description: pack.description,
    icon: pack.icon,
    author: pack.author,
    authorName: pack.authorName,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
  if (skillIds !== undefined) {
    serializedPack.skillIds = skillIds;
  }
  return serializedPack;
}

function resolvePackAuthorName(user) {
  const emailPrefix = typeof user.email === 'string' ? user.email.split('@')[0] : undefined;
  const authorName = [user.name, user.username, emailPrefix].find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
  return typeof authorName === 'string' ? authorName.trim() : undefined;
}

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

const router = express.Router();

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkSkillAccess);

router.get('/', async (_req, res) => {
  try {
    const packs = await listSkillPacks();
    return res.json(packs.map((pack) => serializeSkillPack(pack)));
  } catch (error) {
    logger.error('[skill-packs] Failed to list packs:', error);
    return res.status(500).json({ error: 'Failed to list packs' });
  }
});

router.post('/', checkSkillCreate, async (req, res) => {
  const { name, description, icon, skillIds } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.trim().length > 128 ||
    typeof description !== 'string' ||
    description.trim().length === 0 ||
    description.trim().length > 2048 ||
    (icon !== undefined && (typeof icon !== 'string' || icon.trim().length > 16)) ||
    !Array.isArray(skillIds) ||
    skillIds.length > MAX_SKILL_PACK_SKILLS ||
    !skillIds.every(
      (skillId) => typeof skillId === 'string' && mongoose.Types.ObjectId.isValid(skillId),
    )
  ) {
    return res.status(400).json({ error: 'Invalid skill pack details' });
  }

  const normalizedSkillIds = skillIds.map((skillId) => skillId.toLowerCase());
  if (
    normalizedSkillIds.length < 2 ||
    new Set(normalizedSkillIds).size !== normalizedSkillIds.length
  ) {
    return res.status(400).json({ error: 'A pack must contain at least two different skills' });
  }

  try {
    const publicSkillIds = await findPubliclyAccessibleResources({
      resourceType: ResourceType.SKILL,
      requiredPermissions: PermissionBits.VIEW,
    });
    const publicSkillIdSet = new Set(publicSkillIds.map((skillId) => skillId.toString()));
    if (!normalizedSkillIds.every((skillId) => publicSkillIdSet.has(skillId))) {
      return res.status(400).json({ error: 'Every skill in a pack must be public' });
    }

    const pack = await createSkillPack({
      name: name.trim(),
      description: description.trim(),
      icon: typeof icon === 'string' ? icon.trim() || undefined : undefined,
      skillIds: normalizedSkillIds.map((skillId) => new mongoose.Types.ObjectId(skillId)),
      author: new mongoose.Types.ObjectId(req.user.id),
      authorName: resolvePackAuthorName(req.user),
    });
    return res.status(201).json(pack);
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid skill pack details' });
    }
    logger.error('[skill-packs] Failed to create pack:', error);
    return res.status(500).json({ error: 'Failed to create pack' });
  }
});

router.get('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: 'Pack not found' });
  }

  try {
    const [pack, accessibleSkillIds] = await Promise.all([
      getSkillPackById(req.params.id),
      findAccessibleResources({
        userId: req.user.id,
        role: req.user.role,
        resourceType: ResourceType.SKILL,
        requiredPermissions: PermissionBits.VIEW,
      }),
    ]);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found' });
    }

    const accessibleSkillIdSet = new Set(accessibleSkillIds.map((skillId) => skillId.toString()));
    const visibleSkillIds = pack.skillIds
      .filter((skillId) => accessibleSkillIdSet.has(skillId.toString()))
      .map((skillId) => skillId.toString());
    return res.json(serializeSkillPack(pack, visibleSkillIds));
  } catch (error) {
    logger.error('[skill-packs] Failed to read pack:', error);
    return res.status(500).json({ error: 'Failed to read pack' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pack = await getSkillPackById(req.params.id);
    if (!pack) {
      return res.status(404).json({ error: 'Pack not found' });
    }
    if (pack.author.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Only the pack author can delete it' });
    }

    const result = await deleteSkillPack(pack._id, req.user.id);
    if (!result.deleted) {
      return res.status(404).json({ error: 'Pack not found' });
    }
    return res.json({ deleted: true });
  } catch (error) {
    logger.error('[skill-packs] Failed to delete pack:', error);
    return res.status(500).json({ error: 'Failed to delete pack' });
  }
});

module.exports = router;
