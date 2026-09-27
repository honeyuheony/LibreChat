import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createSkillPackMethods } from './skillPack';
import { createModels } from '../models';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createSkillPackMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createSkillPackMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.SkillPack.deleteMany({});
});

function createInput(name: string, skillCount = 2) {
  return {
    name,
    description: `${name} description`,
    icon: '📦',
    skillIds: Array.from({ length: skillCount }, () => new mongoose.Types.ObjectId()),
    author: new mongoose.Types.ObjectId(),
    authorName: 'Pack Author',
  };
}

describe('createSkillPackMethods', () => {
  it('creates a pack with a server-generated unique slug and timestamps', async () => {
    const input = createInput('Quarterly Reports');
    const pack = await methods.createSkillPack(input);
    const duplicate = await methods.createSkillPack(input);

    expect(pack).toMatchObject({
      name: input.name,
      description: input.description,
      icon: input.icon,
      skillIds: input.skillIds,
      author: input.author,
      authorName: input.authorName,
      slug: 'quarterly-reports',
    });
    expect(duplicate.slug).toBe('quarterly-reports-2');
    expect(pack.createdAt).toBeInstanceOf(Date);
    expect(pack.updatedAt).toBeInstanceOf(Date);
  });

  it('uses different random slugs for Korean pack names', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
    try {
      const first = await methods.createSkillPack(createInput('보고서'));
      const second = await methods.createSkillPack(createInput('검토'));

      expect(first.slug).toMatch(/^pack-[a-z0-9]{6}$/);
      expect(second.slug).toMatch(/^pack-[a-z0-9]{6}$/);
      expect(second.slug).not.toBe(first.slug);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('stops trying slugs after five collisions', async () => {
    const collidedSlugs = ['collision', 'collision-2', 'collision-3', 'collision-4', 'collision-5'];
    await mongoose.models.SkillPack.insertMany(
      collidedSlugs.map((slug, index) => ({
        ...createInput(`Existing ${index}`),
        slug,
      })),
    );

    const existsSpy = jest.spyOn(mongoose.models.SkillPack, 'exists');
    try {
      await expect(methods.createSkillPack(createInput('Collision'))).rejects.toThrow(
        'Unable to generate a unique skill pack slug',
      );
      expect(existsSpy).toHaveBeenCalledTimes(5);
    } finally {
      existsSpy.mockRestore();
    }
  });

  it('lists packs and reads one pack by id', async () => {
    const created = await methods.createSkillPack(createInput('Pack One'));
    await methods.createSkillPack(createInput('Pack Two'));

    const packs = await methods.listSkillPacks();
    const found = await methods.getSkillPackById(created._id);

    expect(packs).toHaveLength(2);
    expect(packs.map((pack) => pack.name)).toEqual(['Pack Two', 'Pack One']);
    expect(found?._id.toString()).toBe(created._id.toString());
    expect(await methods.getSkillPackById('not-an-object-id')).toBeNull();
  });

  it('lists no more than the 100 most recent packs', async () => {
    const packs = Array.from({ length: 101 }, (_, index) => {
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
      return {
        ...createInput(`Pack ${index}`),
        slug: `pack-${index}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
    await mongoose.models.SkillPack.insertMany(packs);

    const listed = await methods.listSkillPacks();

    expect(listed).toHaveLength(100);
    expect(listed[0].name).toBe('Pack 100');
    expect(listed[99].name).toBe('Pack 1');
  });

  it('rejects packs containing fewer than two skills', async () => {
    await expect(methods.createSkillPack(createInput('Single Skill', 1))).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  it('rejects packs containing more than 50 skills', async () => {
    await expect(methods.createSkillPack(createInput('Too Many Skills', 51))).rejects.toMatchObject(
      {
        name: 'ValidationError',
      },
    );
  });

  it('rejects packs that repeat a skill id', async () => {
    const skillId = new mongoose.Types.ObjectId();
    await expect(
      methods.createSkillPack({
        ...createInput('Duplicate Skill'),
        skillIds: [skillId, skillId],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('deletes a pack by id', async () => {
    const created = await methods.createSkillPack(createInput('Pack To Delete'));

    await expect(methods.deleteSkillPack(created._id, created.author)).resolves.toEqual({
      deleted: true,
    });
    await expect(methods.getSkillPackById(created._id)).resolves.toBeNull();
    await expect(methods.deleteSkillPack(created._id, created.author)).resolves.toEqual({
      deleted: false,
    });
  });
});
