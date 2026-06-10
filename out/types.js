"use strict";
// Developer Garden — shared types & constants.
// One source of truth for the data model and the growth tuning numbers.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DORMANT_AFTER_DAYS = exports.DAILY_CAPS = exports.WEIGHTS = exports.STAGES = exports.SKILL_SPECIES = exports.PROJECT_SPECIES = exports.STATE_VERSION = void 0;
exports.stageFor = stageFor;
exports.emptyDay = emptyDay;
exports.emptyState = emptyState;
exports.dayKey = dayKey;
exports.hashString = hashString;
exports.STATE_VERSION = 1;
exports.PROJECT_SPECIES = ['oak', 'birch', 'pine', 'willow', 'maple', 'bamboo'];
exports.SKILL_SPECIES = ['sunflower', 'tulip', 'lavender', 'cactus', 'fern', 'bush'];
/** Growth-point thresholds for each stage. Stages only move forward. */
exports.STAGES = [
    { id: 'seed', label: 'Seed', min: 0 },
    { id: 'sprout', label: 'Sprout', min: 25 },
    { id: 'plant', label: 'Plant', min: 90 },
    { id: 'tree', label: 'Tree', min: 250 },
    { id: 'mature', label: 'Mature', min: 600 }
];
function stageFor(growth) {
    let current = 'seed';
    for (const s of exports.STAGES) {
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
exports.WEIGHTS = {
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
};
/** Anti-farming caps, per local day. */
exports.DAILY_CAPS = {
    activeMinutes: 8 * 60, // a long day still counts; beyond that adds nothing
    saves: 40,
    taskCompletes: 10,
    testPasses: 10
};
/** A plant goes dormant (winter coat, never death) after this many idle days. */
exports.DORMANT_AFTER_DAYS = 14;
function emptyDay() {
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
function emptyState() {
    return {
        version: exports.STATE_VERSION,
        createdAt: Date.now(),
        projects: {},
        skills: {},
        achievements: {},
        wildlife: {},
        days: {},
        totals: { commits: 0, merges: 0, growth: 0, activeDays: [] }
    };
}
function dayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** Small stable hash for deterministic species/visual variety. */
function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
//# sourceMappingURL=types.js.map