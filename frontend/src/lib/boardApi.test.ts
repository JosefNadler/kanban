import { fetchBoard, sendAIChat, updateBoard } from "@/lib/boardApi";
import { initialData } from "@/lib/kanban";

describe("boardApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchBoard sends X-User header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(initialData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchBoard("user");

    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      headers: { "X-User": "user" },
    });
  });

  it("updateBoard sends PUT request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(initialData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateBoard("user", initialData);

    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-User": "user",
      },
      body: JSON.stringify(initialData),
    });
  });

  it("sendAIChat sends prompt and history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Done",
          boardUpdate: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendAIChat("user", "Move card-1", [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User": "user",
      },
      body: JSON.stringify({
        prompt: "Move card-1",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
        ],
      }),
    });
  });
});
