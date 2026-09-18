export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NoulQuestion = {
  type: "noul";
  instructions: JsonValue;
  criteria?: {
    true: JsonValue;
    false: JsonValue;
  };
};

export type TabSnapshot = {
  title: string;
  host: string;
  url: string;
  path: string;
};

export function buildTabQuestions(count: number): Record<string, NoulQuestion> {
  const questions: Record<string, NoulQuestion> = {};
  for (let i = 0; i < count; i++) {
    const tab = `tabs[${i}]`;
    questions[`relevant_${i}`] = {
      type: "noul",
      instructions: {
        question: `Would ${tab} help complete the work described in \`session.work_context\`?`,
        inspect: [
          "`session.work_context`",
          `\`${tab}.title\``,
          `\`${tab}.host\``,
          `\`${tab}.url\``,
        ],
        focus:
          "Judge usefulness for this specific work, not whether the site is educational in general.",
      },
      criteria: {
        true: {
          what: "The page is a source, tool, or reference for the current work.",
          examples: [
            "Course notes or docs for the assignment",
            "A GitHub repo or paper the work uses",
          ],
        },
        false: {
          what: "The page is unrelated to the current work.",
          not_for: "A generally educational page that is not for this work.",
          examples: ["A cooking video during a linear algebra session"],
        },
      },
    };
    questions[`distraction_${i}`] = {
      type: "noul",
      instructions: {
        question: `Is ${tab} primarily entertainment, social media, shopping, or idle browsing rather than work?`,
        inspect: [`\`${tab}.title\``, `\`${tab}.host\``, `\`${tab}.url\``],
        focus: "Judge the page's main purpose from title, host, and path.",
      },
      criteria: {
        true: {
          what: "Main purpose is entertainment, social, shopping, or unfocused browsing.",
          examples: ["Short-form video feeds", "Social timelines", "Shopping carts"],
        },
        false: {
          what: "Main purpose is work, study, reference, or a neutral system page.",
          not_for: "A lecture or tutorial that happens to live on a media site.",
          examples: ["A lecture on YouTube about the current topic"],
        },
      },
    };
    questions[`work_tool_${i}`] = {
      type: "noul",
      instructions: {
        question: `Is ${tab} a general-purpose work or school tool someone would reasonably keep open while doing \`session.work_context\`?`,
        inspect: [
          "`session.work_context`",
          `\`${tab}.title\``,
          `\`${tab}.host\``,
        ],
        focus:
          "Tools, mail, calendars, docs, IDEs, LMS, issue trackers, and reference desks count. Feeds and entertainment do not.",
      },
      criteria: {
        true: {
          what: "Infrastructure for doing work, not the work's subject matter itself.",
          examples: [
            "Google Docs, Canvas, GitHub, Stack Overflow, Gmail, Notion",
          ],
        },
        false: {
          what: "Not a general work tool.",
          examples: ["A meme page", "A game", "A social feed"],
        },
      },
    };
  }
  return questions;
}

export function sessionState(workContext: string, tabs: TabSnapshot[]) {
  return {
    session: {
      mode: "study",
      work_context: workContext,
    },
    tabs: tabs.map((tab, index) => ({
      index,
      title: tab.title.slice(0, 180),
      host: tab.host,
      url: tab.url.slice(0, 300),
      path: tab.path.slice(0, 180),
    })),
  };
}
