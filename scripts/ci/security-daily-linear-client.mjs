import { fingerprintMarker } from "./security-daily-linear-format.mjs";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export class LinearClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async resolveTeamAndLabels(teamQuery, labelNames) {
    const data = await this.request(TEAM_QUERY, { filter: teamFilter(teamQuery) });
    const team = data.teams.nodes.find((candidate) => matchesTeam(candidate, teamQuery));
    if (!team) {
      throw new Error(`Linear team not found: ${teamQuery}`);
    }
    const labels = await this.request(LABELS_QUERY, {
      filter: {
        name: { in: labelNames },
        or: [{ team: { id: { eq: team.id } } }, { team: { null: true } }],
      },
    });
    return { teamId: team.id, labelIds: labelIdsByName(labels.issueLabels.nodes, labelNames) };
  }

  async findIssueByFingerprint(fingerprint, teamId) {
    const marker = fingerprintMarker(fingerprint);
    const filter = {
      searchableContent: { contains: marker },
      team: { id: { eq: teamId } },
    };
    const data = await this.request(ISSUE_SEARCH_QUERY, { filter });
    return data.issues.nodes.find((issue) => issue.description?.includes(marker)) ?? null;
  }

  async createIssue(teamId, input) {
    await this.request(ISSUE_CREATE_MUTATION, { input: { ...input, teamId } });
  }

  async updateIssue(id, input) {
    await this.request(ISSUE_UPDATE_MUTATION, { id, input });
  }

  async request(query, variables) {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ query, variables }),
    });
    return parseLinearResponse(response, await response.text());
  }

  headers() {
    return {
      Authorization: this.apiKey,
      "Content-Type": "application/json",
    };
  }
}

function labelIdsByName(labels, names) {
  const labelsByName = new Map(labels.map((label) => [label.name, label.id]));
  const ids = names.map((name) => labelsByName.get(name));
  const missing = names.filter((name, index) => !ids[index]);
  if (missing.length > 0) {
    throw new Error(`Linear labels not found: ${missing.join(", ")}`);
  }
  return ids;
}

function matchesTeam(team, query) {
  const normalized = normalizeTeamQuery(query);
  return [team.id, team.key, team.name].some((value) => normalizeTeamQuery(value) === normalized);
}

function normalizeTeamQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function teamFilter(teamQuery) {
  if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(teamQuery)) {
    return { id: { eq: teamQuery } };
  }
  return {
    or: [{ key: { eq: teamQuery } }, { name: { eq: teamQuery } }],
  };
}

function parseLinearResponse(response, text) {
  const body = parseJsonText(text);
  if (!response.ok) {
    throw new Error(`Linear API request failed with HTTP ${String(response.status)}`);
  }
  if (body.errors?.length > 0) {
    const messages = body.errors.map((error) => error.message).join("; ");
    throw new Error(`Linear API error: ${messages}`);
  }
  return body.data;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Linear API returned non-JSON response");
  }
}

const TEAM_QUERY = `
  query SecurityFindingTeam($filter: TeamFilter!) {
    teams(filter: $filter, first: 10) {
      nodes {
        id
        key
        name
      }
    }
  }
`;

const LABELS_QUERY = `
  query SecurityFindingLabels($filter: IssueLabelFilter!) {
    issueLabels(filter: $filter, first: 250) {
      nodes {
        id
        name
      }
    }
  }
`;

export const ISSUE_SEARCH_QUERY = `
  query SecurityFindingSearch($filter: IssueFilter!) {
    issues(filter: $filter, first: 10) {
      nodes {
        id
        description
      }
    }
  }
`;

const ISSUE_CREATE_MUTATION = `
  mutation SecurityFindingCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
    }
  }
`;

const ISSUE_UPDATE_MUTATION = `
  mutation SecurityFindingUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
    }
  }
`;
