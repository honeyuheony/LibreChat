import type { Model, Types } from 'mongoose';
import type { ISkillPack, ISkillPackDocument } from '~/types/skillPack';

const MAX_SKILL_PACK_SLUG_ATTEMPTS = 5;
const MAX_SKILL_PACKS = 100;

export type CreateSkillPackInput = Pick<
  ISkillPack,
  'name' | 'description' | 'icon' | 'skillIds' | 'author' | 'authorName'
>;
export type SkillPackRecord = ISkillPack & { _id: Types.ObjectId };

export type SkillPackMethods = {
  createSkillPack: (input: CreateSkillPackInput) => Promise<SkillPackRecord>;
  listSkillPacks: () => Promise<SkillPackRecord[]>;
  getSkillPackById: (id: string | Types.ObjectId) => Promise<SkillPackRecord | null>;
  deleteSkillPack: (
    id: string | Types.ObjectId,
    authorId: string | Types.ObjectId,
  ) => Promise<{ deleted: boolean }>;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    error.code === 11000
  );
}

function createSlugBase(name: string): string | null {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

function createRandomSlug(): string {
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `pack-${suffix}`;
}

function createSlugCandidate(baseSlug: string | null, attempt: number): string {
  if (baseSlug === null) {
    return createRandomSlug();
  }
  if (attempt === 0) {
    return baseSlug;
  }
  return `${baseSlug}-${attempt + 1}`;
}

export function createSkillPackMethods(mongoose: typeof import('mongoose')): SkillPackMethods {
  const SkillPack = mongoose.models.SkillPack as Model<ISkillPackDocument>;

  async function createSkillPack(input: CreateSkillPackInput): Promise<SkillPackRecord> {
    const baseSlug = createSlugBase(input.name);
    for (let attempt = 0; attempt < MAX_SKILL_PACK_SLUG_ATTEMPTS; attempt += 1) {
      const slug = createSlugCandidate(baseSlug, attempt);
      if (await SkillPack.exists({ slug })) {
        continue;
      }
      try {
        const pack = await SkillPack.create({ ...input, slug });
        return pack.toObject();
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }
    throw new Error('Unable to generate a unique skill pack slug');
  }

  async function listSkillPacks(): Promise<SkillPackRecord[]> {
    const packs = await SkillPack.find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_SKILL_PACKS)
      .lean();
    return packs as SkillPackRecord[];
  }

  async function getSkillPackById(id: string | Types.ObjectId): Promise<SkillPackRecord | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    const pack = await SkillPack.findById(id).lean();
    return (pack as SkillPackRecord | null) ?? null;
  }

  async function deleteSkillPack(
    id: string | Types.ObjectId,
    authorId: string | Types.ObjectId,
  ): Promise<{ deleted: boolean }> {
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(authorId)) {
      return { deleted: false };
    }
    const result = await SkillPack.deleteOne({ _id: id, author: authorId });
    return { deleted: result.deletedCount === 1 };
  }

  return { createSkillPack, listSkillPacks, getSkillPackById, deleteSkillPack };
}
