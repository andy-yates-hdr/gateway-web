import apis from "@/config/apis";
import { GetMissionAndPurposesQuery } from "@/config/queries/missionAndPurposes";
import { GetReleaseNotesQuery } from "@/config/queries/releaseNotes";
import { GetTermsAndConditionsQuery } from "@/config/queries/termsAndConditions";
import {
    getReleaseNotes,
    getMissionAndPurposes,
    getTermsAndConditions,
    substituteEnvLinks,
} from "@/utils/cms";

const sessionId = "123421";

jest.mock("next/headers", () => ({
    cookies: jest.fn(() => ({
        get: jest.fn().mockReturnValue({ value: sessionId }),
    })),
}));
jest.mock("@/flags", () => ({
    isMarkdownContentEnabled: jest.fn().mockResolvedValue(false),
}));
describe("CMS utils", () => {
    beforeAll(() => {
        jest.spyOn(window, "fetch");
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getReleaseNotes", () => {
        it("should call fetch with correct params", async () => {
            await getReleaseNotes();

            expect(window.fetch).toBeCalledWith(apis.wordPressApiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "x-Request-Session-Id": "web: 123421",
                },
                method: "POST",
                body: JSON.stringify({ query: GetReleaseNotesQuery }),
                next: { revalidate: 10 },
            });
        });
    });
    describe("getMissionAndPurposes", () => {
        it("should call fetch with correct params", async () => {
            await getMissionAndPurposes();

            expect(window.fetch).toBeCalledWith(apis.wordPressApiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "x-Request-Session-Id": "web: 123421",
                },
                method: "POST",
                body: JSON.stringify({ query: GetMissionAndPurposesQuery }),
                next: { revalidate: 10 },
            });
        });
    });
    describe("getTermsAndConditions", () => {
        it("should call fetch with correct params", async () => {
            await getTermsAndConditions();

            expect(window.fetch).toBeCalledWith(apis.wordPressApiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "x-Request-Session-Id": "web: 123421",
                },
                method: "POST",
                body: JSON.stringify({ query: GetTermsAndConditionsQuery }),
                next: { revalidate: 10 },
            });
        });
    });

    describe("substituteEnvLinks", () => {
        it("should replace the correct link hostname", async () => {
            const result = await substituteEnvLinks({
                data: {
                    nodes: [
                        {
                            content:
                                '<p><a href="https://web.preprod.hdruk.cloud">Link</a></p>',
                        },
                    ],
                },
            });

            expect(result).toEqual({
                data: {
                    nodes: [
                        {
                            content:
                                '<p><a href="https://web.dev.hdruk.cloud">Link</a></p>',
                        },
                    ],
                },
            });
        });
    });
});
