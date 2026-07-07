import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  formatGuideTopicList,
  formatUnknownGuideTopicMessage,
  getGuideTopic,
} from "../guides/registry.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_VALIDATION } from "../output/exit-codes.js";

export function runGuideCommand(topicId?: string): number {
  if (topicId === undefined || topicId.length === 0) {
    process.stdout.write(`${formatGuideTopicList()}\n`);
    return 0;
  }

  const topic = getGuideTopic(topicId);
  if (topic === undefined) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: formatUnknownGuideTopicMessage(topicId),
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }

  process.stdout.write(`${topic.content.trimEnd()}\n`);
  return 0;
}
