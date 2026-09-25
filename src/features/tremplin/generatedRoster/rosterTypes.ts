import type { TremplinRoleId } from "../tremplinRoleData";

export type TremplinGeneratedRosterSeed = {
  id: string;
  name: string;
  image: string;
  exactProfession: string;
  roleId: TremplinRoleId;
  disciplines: readonly string[];
  styles: readonly string[];
  city: string;
  region: string;
  stageLabel: string;
  biography: string;
  audioTitle: string;
  gradeLevel?: 1 | 2 | 3 | 4 | 5 | 6;
};
