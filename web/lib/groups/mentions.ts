// Matches "@all" or "@handle" tokens inside a group chat message. Used both
// to render mention chips (any sender) and, server-side, to decide whether
// an ADMIN/creator's message should page members directly (lib/push).
export const MENTION_PATTERN = /@(all|[a-zA-Z0-9_.]+)/g;
// Same alternation, capturing the delimiter — for splitting message text
// into plain-text/mention runs for rendering.
export const MENTION_SPLIT_PATTERN = /(@(?:all|[a-zA-Z0-9_.]+))/g;

export function parseMentions(body: string): { mentionsAll: boolean; handles: string[] } {
  const handles = new Set<string>();
  let mentionsAll = false;
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const token = match[1].toLowerCase();
    if (token === "all") mentionsAll = true;
    else handles.add(token);
  }
  return { mentionsAll, handles: [...handles] };
}
