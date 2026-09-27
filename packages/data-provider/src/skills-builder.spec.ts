import * as endpoints from './api-endpoints';
import * as service from './data-service';
import request from './request';

const packEndpoint = () => endpoints.skills().replace(/\/api\/skills$/, '/api/skill-packs');

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('skill builder endpoints', () => {
  it('builds the draft route', () => {
    expect(endpoints.skillDraft()).toBe(`${endpoints.skills()}/draft`);
  });

  it('builds the test-result route with an encoded id', () => {
    expect(endpoints.skillTestResult('skill/id')).toBe(
      `${endpoints.getSkill('skill/id')}/test-result`,
    );
  });

  it('builds the publish route with an encoded id', () => {
    expect(endpoints.skillPublish('skill/id')).toBe(`${endpoints.getSkill('skill/id')}/publish`);
  });

  it('builds the skill pack collection route', () => {
    expect(endpoints.skillPacks()).toBe(packEndpoint());
  });

  it('builds the skill pack detail route with an encoded id', () => {
    expect(endpoints.skillPack('pack/id')).toBe(`${packEndpoint()}/pack%2Fid`);
  });
});

describe('skill builder data services', () => {
  it('posts a draft request to the draft endpoint', async () => {
    const post = jest.spyOn(request, 'post').mockResolvedValue({});
    const payload = { text: '정기 보고서를 작성한다', direct: false };

    await service.createSkillDraft(payload);

    expect(post).toHaveBeenCalledWith(`${endpoints.skills()}/draft`, payload);
  });

  it('posts the test result to the skill endpoint', async () => {
    const post = jest.spyOn(request, 'post').mockResolvedValue({});
    const id = 'skill/id';
    const payload = { conversationId: 'convo-1', version: 3 };

    await service.recordSkillTestResult(id, payload);

    expect(post).toHaveBeenCalledWith(`${endpoints.getSkill(id)}/test-result`, payload);
  });

  it('posts a publish request to the skill endpoint', async () => {
    const post = jest.spyOn(request, 'post').mockResolvedValue({});
    const id = 'skill/id';
    const payload = { scope: 'all' as const };

    await service.publishSkill(id, payload);

    expect(post).toHaveBeenCalledWith(`${endpoints.getSkill(id)}/publish`, payload);
  });

  it('gets the skill pack list', async () => {
    const get = jest.spyOn(request, 'get').mockResolvedValue([]);

    await service.listSkillPacks();

    expect(get).toHaveBeenCalledWith(packEndpoint());
  });

  it('posts a skill pack to the collection endpoint', async () => {
    const post = jest.spyOn(request, 'post').mockResolvedValue({});
    const payload = {
      name: '업무 팩',
      description: '업무 스킬 모음',
      skillIds: ['skill-1', 'skill-2'],
    };

    await service.createSkillPack(payload);

    expect(post).toHaveBeenCalledWith(packEndpoint(), payload);
  });

  it('gets a skill pack by encoded id', async () => {
    const get = jest.spyOn(request, 'get').mockResolvedValue({});
    const id = 'pack/id';

    await service.getSkillPack(id);

    expect(get).toHaveBeenCalledWith(`${packEndpoint()}/pack%2Fid`);
  });

  it('deletes a skill pack by encoded id', async () => {
    const remove = jest.spyOn(request, 'delete').mockResolvedValue({ deleted: true });
    const id = 'pack/id';

    await service.deleteSkillPack(id);

    expect(remove).toHaveBeenCalledWith(`${packEndpoint()}/pack%2Fid`);
  });
});
