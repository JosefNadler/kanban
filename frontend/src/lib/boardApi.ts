import type { BoardData } from "@/lib/kanban";

const getErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
  } catch {
    // Ignore JSON parse errors and use generic message below.
  }
  return `Request failed with status ${response.status}.`;
};

export const fetchBoard = async (username: string): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    headers: { "X-User": username },
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
};

export const updateBoard = async (
  username: string,
  board: BoardData
): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-User": username,
    },
    body: JSON.stringify(board),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
};

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AIChatResult = {
  message: string;
  boardUpdate: BoardData | null;
};

export const sendAIChat = async (
  username: string,
  prompt: string,
  history: AIChatMessage[]
): Promise<AIChatResult> => {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User": username,
    },
    body: JSON.stringify({ prompt, history }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
};
