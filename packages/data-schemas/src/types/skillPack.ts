import type { Document, Types } from 'mongoose';

export interface ISkillPack {
  name: string;
  slug: string;
  description: string;
  icon?: string;
  skillIds: Types.ObjectId[];
  author: Types.ObjectId;
  authorName: string;
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISkillPackDocument extends ISkillPack, Document {}
