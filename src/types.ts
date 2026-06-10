// Developer Garden — shared types & constants.
// One source of truth for the data model and the growth tuning numbers.

export const STATE_VERSION = 1;

/** YYYY-MM-DD in the user's local time. */
export type DayKey = string;

export type PlantKind = 'project' | 'skill';

/** Visual species are assigned deterministically and never change. */
export type Species =
  | 'oak'
  | 'birch'
  | 'pine'
  | 'willow'
  | 'bush'
  | 'fern'
  | 'sunflower'
  | 'tulip'
  | 'lavender'
  | 'cactus'
  | 'bamboo'
  | 'maple';

export const PROJECT_SPECIES: Species[] = ['oak', 'birch', 'pine', 'willow', 'maple', 'bamboo'];
export const SKILL_SPECIES: Species[] = ['sunflower', 'tulip', 'lavender', 'cactus', 'fern', 'bush'];

/** Growth-point thresholds for each stage. Stages only move forward. */
export const STAGES = [
  { id: 'seed', label: 'Seed', min: 0 },
  { id: 'sprout', label: 'Sprout', min: 25 },
  { id: 'plant', label: 'Plant', min: 90 },
  { id: 'tree', label: 'Tree', min: 250 },
  { id: 'mature', label: 'Mature', min: 600 }
] as const;

export type StageId = (typeof STAGES)[number]['id'];

export function stageFor(growth: number): StageId {
  let current: StageId = 'seed';
  for (const s of STAGES) {
    if (growth >= s.min) {
      current = s.id;
    }
  }
  return current;
}

/**
 * Weighted growth signals (the spec's growth system).
 * Time, saves and the consistency bonus are rate-limited in the engine so
 * none of these can be farmed by keystrokes or save-spamming.
 */
export const WEIGHTS = {
  /** One genuinely active minute of work (debugging counts — presence, not output). */
  activeMinute: 1,
  /** A meaningful save (rate-limited; the diff size is deliberately ignored). */
  save: 2,
  /** A git commit. */
  commit: 12,
  /** A merge commit / merged branch detected locally. */
  merge: 25,
  /** A test task that finished successfully. */
  testPass: 8,
  /** A VS Code task that finished successfully (build, deploy, etc.). */
  taskComplete: 4,
  /** Daily consistency bonus: granted once per day when 3+ of the last 7 days were active. */
  consistencyBonus: 15,
  /** Manual watering — play, not progress. Capped at once per plant per day. */
  water: 2
} as const;

/** Anti-farming caps, per local day. */
export const DAILY_CAPS = {
  activeMinutes: 8 * 60, // a long day still counts; beyond that adds nothing
  saves: 40,
  taskCompletes: 10,
  testPasses: 10
} as const;

/** A plant goes dormant (winter coat, never death) after this many idle days. */
export const DORMANT_AFTER_DAYS = 14;

export interface ProjectPlant {
  id: string;
  name: string;
  /** First folder path we saw for this project (not uploaded anywhere). */
  fsPath: string;
  species: Species;
  growth: number;
  firstSeen: number; // epoch ms
  lastActive: number; // epoch ms
  totalMinutes: number;
  totalCommits: number;
  /** Last time the user watered this plant for fun (optional, never required). */
  lastWatered?: number;
}

export interface SkillPlant {
  id: string;
  name: string;
  species: Species;
  growth: number;
  firstSeen: number;
  lastActive: number;
  totalMinutes: number;
}

export interface DayLog {
  minutes: number;
  saves: number;
  commits: number;
  merges: number;
  tasks: number;
  tests: number;
  growth: number;
  filesTouched: number;
  milestones: string[];
  consistencyBonusGranted: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  /** What it adds to the garden, e.g. 'flowerbed', 'lantern'. */
  reward: string;
}

export interface WildlifeDef {
  id: string;
  name: string;
  hint: string; // shown before unlock, kept vague & friendly
}

export interface GardenState {
  version: number;
  createdAt: number;
  projects: Record<string, ProjectPlant>;
  skills: Record<string, SkillPlant>;
  /** achievement id -> unlockedAt epoch ms */
  achievements: Record<string, number>;
  /** wildlife id -> unlockedAt epoch ms */
  wildlife: Record<string, number>;
  days: Record<DayKey, DayLog>;
  totals: {
    commits: number;
    merges: number;
    growth: number;
    /** distinct active local days */
    activeDays: DayKey[];
  };
}

export function emptyDay(): DayLog {
  return {
    minutes: 0,
    saves: 0,
    commits: 0,
    merges: 0,
    tasks: 0,
    tests: 0,
    growth: 0,
    filesTouched: 0,
    milestones: [],
    consistencyBonusGranted: false
  };
}

export function emptyState(): GardenState {
  return {
    version: STATE_VERSION,
    createdAt: Date.now(),
    projects: {},
    skills: {},
    achievements: {},
    wildlife: {},
    days: {},
    totals: { commits: 0, merges: 0, growth: 0, activeDays: [] }
  };
}

export function dayKey(d = new Date()): DayKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Small stable hash for deterministic species/visual variety. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
