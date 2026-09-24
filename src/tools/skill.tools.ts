/**
 * Skill discovery tools: `list_skills` (browse the catalog) and `use_skill`
 * (load a skill's full instructions into the run context).
 *
 * The catalog that ships in the system prompt carries ONLY id + description,
 * so skills stay token-cheap until the model actually opens one. use_skill
 * pushes the loaded body into ctx.runtimeInstructions, which buildLLMMessages
 * renders under "## Run Guidance" on the next LLM call — the skill then governs
 * the remainder of the matching work.
 */
import type { ToolDefinition, ToolContext } from './tool-registry.js';
import type { SkillRegistry } from '../skills.js';

export function getListSkillsTool(registry: SkillRegistry): ToolDefinition {
  return {
    name: 'list_skills',
    description:
      'List the SKILLS available to this agent. A skill is a bundle of instructions for a repeatable ' +
      'routine (a workflow, a set of rules, a do/don\'t checklist). The catalog shows only each skill\'s ' +
      'id + one-line description — the full instructions load lazily with use_skill so the context stays lean. ' +
      'When a task matches a skill\'s description, LOAD it with use_skill BEFORE starting the work, then ' +
      'follow it while the task matches.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (): Promise<import('./tool-registry.js').ToolResult> => {
      const all = registry.all();
      if (all.length === 0) {
        return { content: [{ type: 'text', text: 'No skills are registered for this run.' }] };
      }
      const rows = all
        .map((s) => `- ${s.id}: ${s.description}${s.name !== s.id ? `  (name: ${s.name})` : ''}`)
        .join('\n');
      return {
        content: [{
          type: 'text',
          text:
            `Available skills (${all.length}):\n\n${rows}\n\n` +
            `Load one with use_skill({skillId: "<id>"}) to bring its full instructions into the run context — follow them while the task matches.`,
        }],
      };
    },
  };
}

export function getUseSkillTool(registry: SkillRegistry): ToolDefinition {
  return {
    name: 'use_skill',
    description:
      'Load a registered skill\'s FULL instructions into the run context. Skills are discoverable via ' +
      'list_skills (id + description). Call use_skill when the current task matches a skill\'s description, ' +
      'BEFORE doing the work it describes — the skill then applies for the rest of the matching work. ' +
      'Supporting files (scripts, references) live in the skill\'s folder; the path is returned in the result.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: 'The skill id as shown by list_skills (e.g. "commit-message").',
        },
      },
      required: ['skillId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (
      input: Record<string, unknown>,
      ctx: ToolContext,
    ): Promise<import('./tool-registry.js').ToolResult> => {
      const skillId = String(input.skillId ?? '').trim();
      const skill = registry.get(skillId);
      if (!skill) {
        const ids = registry.all().map((s) => s.id).join(', ') || '(none)';
        return {
          content: [{ type: 'text', text: `Unknown skill "${skillId}". Available skills: ${ids}.\nRun list_skills to browse the catalog.` }],
          isError: true,
        };
      }
      const block = `## Skill: ${skill.name}\n\n${skill.content}`;
      if (Array.isArray(ctx.runtimeInstructions)) {
        ctx.runtimeInstructions.push(block);
      }
      return {
        content: [{
          type: 'text',
          text:
            `Loaded skill "${skill.id}" (${skill.name}) into the run context — follow it while the current task matches.\n` +
            `Skill folder: ${skill.dir}\n\n${skill.content.slice(0, 400)}${skill.content.length > 400 ? '\n…' : ''}`,
        }],
      };
    },
  };
}