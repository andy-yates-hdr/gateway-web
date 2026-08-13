import { render, screen, waitFor } from "@/utils/testUtils";
import { releaseV1 } from "@/mocks/data/cms";
import ReleasePage from "./page";

jest.useFakeTimers().setSystemTime(new Date("2024-01-01"));
jest.mock("next/headers", () => ({
    cookies: jest.fn(() => ({
        get: jest.fn().mockReturnValue({ value: 123421 }),
    })),
}));
jest.mock("@/flags", () => ({
    isMarkdownContentEnabled: jest.fn().mockResolvedValue(false),
}));
describe("Releases", () => {
    it("should render contents", async () => {
        const Result = await ReleasePage();

        render(Result);

        await waitFor(() => {
            expect(
                screen.getByText(releaseV1.posts.edges[0].node.title)
            ).toBeInTheDocument();
            expect(
                screen.queryByText(releaseV1.posts.edges[1].node.title)
            ).not.toBeInTheDocument();
            expect(
                screen.getByText(releaseV1.posts.edges[2].node.title)
            ).toBeInTheDocument();
        });
    });
});
