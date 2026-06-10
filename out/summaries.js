"use strict";
// Daily & weekly summaries. Tone rules: descriptive, warm, zero judgment.
// A quiet day produces a quiet sentence, never a warning.
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailySummary = dailySummary;
exports.weeklySummary = weeklySummary;
exports.dailyText = dailyText;
exports.weeklyText = weeklyText;
exports.stageLabel = stageLabel;
const types_1 = require("./types");
const achievements_1 = require("./achievements");
function hours(min) {
    if (min < 60) {
        return `${min} min`;
    }
    return `${(min / 60).toFixed(1)} hrs`;
}
function dailySummary(state, key = (0, types_1.dayKey)()) {
    const day = state.days[key];
    return {
        date: key,
        minutes: day?.minutes ?? 0,
        files: day?.filesTouched ?? 0,
        commits: day?.commits ?? 0,
        growth: day?.growth ?? 0,
        milestones: day?.milestones ?? [],
        streak: (0, achievements_1.currentStreak)(state)
    };
}
function weeklySummary(state) {
    const keys = [];
    const cursor = new Date();
    for (let i = 0; i < 7; i++) {
        keys.push((0, types_1.dayKey)(cursor));
        cursor.setDate(cursor.getDate() - 1);
    }
    let minutes = 0;
    let commits = 0;
    let growth = 0;
    let activeDays = 0;
    const milestones = [];
    for (const k of keys) {
        const d = state.days[k];
        if (!d) {
            continue;
        }
        activeDays++;
        minutes += d.minutes;
        commits += d.commits;
        growth += d.growth;
        milestones.push(...d.milestones);
    }
    const weekAgo = Date.now() - 7 * 86400000;
    const recentProjects = Object.values(state.projects).filter((p) => p.lastActive >= weekAgo);
    const recentSkills = Object.values(state.skills).filter((s) => s.lastActive >= weekAgo);
    recentProjects.sort((a, b) => b.lastActive - a.lastActive || b.growth - a.growth);
    recentSkills.sort((a, b) => b.growth - a.growth);
    return {
        from: keys[keys.length - 1],
        to: keys[0],
        minutes,
        commits,
        growth,
        activeDays,
        mostActiveProject: recentProjects[0]?.name,
        mostImprovedSkill: recentSkills[0]?.name,
        milestones
    };
}
function dailyText(s) {
    if (s.minutes === 0 && s.growth === 0) {
        return 'A quiet day. Your garden is resting — it will be here when you are.';
    }
    const lines = [
        `Today: ${hours(s.minutes)} worked · ${s.files} files touched · ${s.commits} commits`,
        `Your garden gained ${s.growth} growth points.`
    ];
    if (s.streak > 1) {
        lines.push(`You've been at this ${s.streak} days in a row.`);
    }
    if (s.milestones.length) {
        lines.push(...s.milestones.map((m) => `• ${m}`));
    }
    return lines.join('\n');
}
function weeklyText(w) {
    if (w.activeDays === 0) {
        return 'A restful week. Everything you planted is still here.';
    }
    const lines = [
        `This week: ${hours(w.minutes)} across ${w.activeDays} day${w.activeDays === 1 ? '' : 's'} · ${w.commits} commits · +${w.growth} growth`
    ];
    if (w.mostActiveProject) {
        lines.push(`Most active project: ${w.mostActiveProject}`);
    }
    if (w.mostImprovedSkill) {
        lines.push(`Most improved skill: ${w.mostImprovedSkill}`);
    }
    if (w.milestones.length) {
        lines.push('Milestones:', ...w.milestones.map((m) => `• ${m}`));
    }
    return lines.join('\n');
}
function stageLabel(growth) {
    const id = (0, types_1.stageFor)(growth);
    return types_1.STAGES.find((s) => s.id === id)?.label ?? 'Seed';
}
//# sourceMappingURL=summaries.js.map