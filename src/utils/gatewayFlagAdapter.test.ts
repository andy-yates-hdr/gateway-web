import { createAPIFlagAdapter } from "./gatewayFlagAdapter";

jest.mock("@/config/apis", () => ({
    __esModule: true,
    default: {
        features: "http://localhost/mock-api",
    },
}));

jest.mock("next/headers", () => ({
    cookies: jest.fn(),
}));

describe("createGatewayFlagAdapter", () => {
    const mockResponse = {
        message: "OK",
        data: { SDEConciergeServiceEnquiry: true, Aliases: false },
    };

    let adapter: ReturnType<ReturnType<typeof createAPIFlagAdapter>>;

    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        }) as jest.Mock;

        jest.useFakeTimers();
        adapter = createAPIFlagAdapter()();
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it("refetches after TTL expiry", async () => {
        await adapter.decide({ key: "SDEConciergeServiceEnquiry" });

        jest.advanceTimersByTime(5 * 60 * 1000 + 1);

        await adapter.decide({ key: "Aliases" });

        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("fetches feature flags", async () => {
        const result = await adapter.decide({
            key: "SDEConciergeServiceEnquiry",
        });
        expect(result).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(1);

        const result2 = await adapter.decide({ key: "Aliases" });
        expect(result2).toBe(false);

        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("handles API failure gracefully", async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            statusText: "Service Unavailable",
        });

        const result = await adapter.decide({ key: "NonExistent" });
        expect(result).toBe(false);
    });

    it("handles network error gracefully", async () => {
        (fetch as jest.Mock).mockRejectedValueOnce(new Error("Network Error"));

        const result = await adapter.decide({ key: "NonExistent" });
        expect(result).toBe(false);
    });
});

describe("createGatewayFlagAdapter — invalid apis.features shapes", () => {
    afterEach(() => {
        jest.dontMock("@/config/apis");
        jest.resetModules();
    });

    it.each([
        ["unset, stringified", "undefined/features"],
        ["set but blank", "/features"],
        ["empty string", ""],
    ])(
        "skips the fetch entirely when apis.features is %s (%s)",
        async (_label, featuresValue) => {
            jest.resetModules();
            jest.doMock("@/config/apis", () => ({
                __esModule: true,
                default: { features: featuresValue },
            }));

            const { createAPIFlagAdapter: freshCreateAPIFlagAdapter } =
                await import("./gatewayFlagAdapter");
            const fetchMock = jest.fn();
            global.fetch = fetchMock as unknown as typeof fetch;

            const freshAdapter = freshCreateAPIFlagAdapter()();
            const result = await freshAdapter.decide({ key: "AnyFlag" });

            expect(result).toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
        }
    );
});
