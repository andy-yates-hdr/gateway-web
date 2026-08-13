import type { Adapter } from "@vercel/flags";
import { cookies } from "next/headers";
import apis from "@/config/apis";
import config from "@/config/config";

export type Features = Record<string, boolean>;

export interface FeatureFlagsResponse {
    message: string;
    data: Features;
}

const isValidAbsoluteUrl = (value: unknown): value is string => {
    if (typeof value !== "string" || !value) return false;

    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
};

/**
 * `apis.features` is built from `NEXT_PUBLIC_API_V1_IP_URL`/`NEXT_PUBLIC_API_V1_URL`
 * (see `config/apis.ts`); when running gateway-web alone, without
 * `gateway-api` — which every flag in `flags.ts` still gets `await`ed once
 * per request in `layout.tsx` — that's either unset (stringifying to the
 * literal text "undefined", e.g. no `.env.local` at all) or set to an empty
 * string (e.g. `.env.local` defines the key with a blank value), giving
 * "undefined/features" or "/features" respectively — neither a URL `fetch`
 * can parse. That failure was already caught and defaulted to `{}` below,
 * but only after logging a `console.error` for every flag on every request.
 * Checking the URL is actually valid first means the same safe `{}`
 * fallback, without the noise, regardless of which broken shape it took.
 */
const getFeatures = async (): Promise<Record<string, boolean>> => {
    if (!isValidAbsoluteUrl(apis.features)) {
        return {};
    }

    try {
        const cookieStore = await cookies();
        const jwtToken = cookieStore?.get(config.JWT_COOKIE)?.value;
        const hasToken = Boolean(jwtToken);
        //get my feature flags when logged in, otherwise get global features
        const url = hasToken ? `${apis.features}/me` : `${apis.features}`;

        const res = await fetch(url, {
            headers: hasToken
                ? { Authorization: `Bearer ${jwtToken}` }
                : undefined,
            cache: "no-store",
        });

        if (!res.ok) {
            console.error(`Failed to fetch feature flags: ${res.statusText}`);
            return {};
        }

        const features: FeatureFlagsResponse = await res.json();

        return features.data;
    } catch (err) {
        console.error(
            "Error fetching feature flags, will retry after cache is stale",
            err
        );
        return {};
    }
};

export function createAPIFlagAdapter() {
    return function apiFlagAdapter<ValueType, EntitiesType>(): Adapter<
        ValueType,
        EntitiesType
    > {
        return {
            async decide({ key }): Promise<ValueType> {
                const features = await getFeatures();
                return (features[key] ?? false) as ValueType;
            },
        };
    };
}