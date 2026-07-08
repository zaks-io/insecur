import hooksContent from "./hooks.md";
import migrateEnvContent from "./migrate-env.md";

export interface GuideTopic {
  readonly id: string;
  readonly description: string;
  readonly content: string;
}

const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    id: "hooks",
    description: "Agent scan-gate hook recipes for Claude Code and Codex",
    content: hooksContent,
  },
  {
    id: "migrate-env",
    description: "Safe playbook for moving disk secrets into insecur",
    content: migrateEnvContent,
  },
] as const;

const TOPICS_BY_ID = new Map(GUIDE_TOPICS.map((topic) => [topic.id, topic]));

export function listGuideTopicIds(): readonly string[] {
  return GUIDE_TOPICS.map((topic) => topic.id);
}

export function getGuideTopic(topicId: string): GuideTopic | undefined {
  return TOPICS_BY_ID.get(topicId);
}

export function formatGuideTopicList(): string {
  const lines = ["insecur guide topics:", ""];
  for (const topic of GUIDE_TOPICS) {
    lines.push(`  ${topic.id}  ${topic.description}`);
  }
  return lines.join("\n");
}

export function formatUnknownGuideTopicMessage(topicId: string): string {
  const lines = [
    `Unknown guide topic: ${topicId}`,
    "",
    "Available topics:",
    ...GUIDE_TOPICS.map((topic) => `  ${topic.id}  ${topic.description}`),
  ];
  return lines.join("\n");
}
