"use server";

import dayjs from "dayjs";
import {
    CMSPageResponse,
    CMSPagesResponse,
    CMSPostResponse,
    CMSPostsResponse,
    ContentPageByParentQueryOptions,
    ContentPageQueryOptions,
    PageTemplateDefault,
    PageTemplateHome,
    PageTemplatePromo,
    PageTemplateRepeat,
    CohortDiscoveryTemplate,
} from "@/interfaces/Cms";
import { ContributorsAndCollaboratorsNode } from "@/interfaces/ContributorsAndCollaborators";
import { EventNode } from "@/interfaces/Events";
import { HomepageBannerNode } from "@/interfaces/Homepage";
import { MeetTheTeamNode } from "@/interfaces/MeetTheTeam";
import { MissionAndPurposesNode } from "@/interfaces/MissionAndPurposes";
import { NewsNode } from "@/interfaces/News";
import { ReleaseNode } from "@/interfaces/Releases";
import { SupportCohortDiscoveryPage } from "@/interfaces/Support";
import apis from "@/config/apis";
import { GetCohortDiscoveryQuery } from "@/config/queries/cohortDiscovery";
import { GetCohortDiscoverySupportPageQuery } from "@/config/queries/cohortDiscoverySupport";
import { GetCohortTermsAndConditionsQuery } from "@/config/queries/cohortTermsAndConditions";
import {
    GetContentPageQuery,
    GetContentPagesByNameQuery,
} from "@/config/queries/contentPage";
import { GetContentPostQuery } from "@/config/queries/contentPost";
import { GetContributorsAndCollaboratorsQuery } from "@/config/queries/contributorsAndCollaborators";
import { GetEventsQuery } from "@/config/queries/events";
import { GetHomePageBanner, GetHomePageQuery } from "@/config/queries/homePage";
import { GetHowToSearchQuery } from "@/config/queries/howToSearch";
import { GetMeetTheTeamQuery } from "@/config/queries/meetTheTeam";
import { GetMissionAndPurposesQuery } from "@/config/queries/missionAndPurposes";
import { GetNewCohortDiscoveryQuery } from "@/config/queries/newCohortDiscovery";
import { GetNewsQuery } from "@/config/queries/news";
import { GetReleaseNotesQuery } from "@/config/queries/releaseNotes";
import { GetTermsAndConditionsQuery } from "@/config/queries/termsAndConditions";
import { sessionHeader, sessionPrefix } from "@/config/session";
import { isMarkdownContentEnabled } from "@/flags";
import { getSessionCookie } from "./getSessionCookie";
import { logger } from "./logger";
import { loadCollection, loadPage, toPageTemplateDefault } from "./markdownContent";
import { toPublicAssetUrl } from "./markdownAssetUrl";

const DEFAULT_OPTIONS = {
    next: { revalidate: 10 },
};

const substituteEnvLinks = async <T>(content: T) => {
    if (!content) return null;

    const environments = [
        "web.preprod.hdruk.cloud",
        "web.dev.hdruk.cloud",
        "web.prod.hdruk.cloud",
        "www.healthdatagateway.org",
    ];

    const regexp = new RegExp(
        `${environments.join("|").replace(/\./g, "\\.")}`,
        "gi"
    );

    try {
        const hostname = process.env.NEXT_PUBLIC_CMS_LINK_HOSTNAME;

        if (hostname) {
            return JSON.parse(
                JSON.stringify(content).replace(regexp, hostname)
            ) as T;
        }

        console.warn("Cms link hostname env not set");

        return content;
    } catch (_) {
        return content;
    }
};

function textResponseToJson(response: string) {
    let output = "";

    response.split("").forEach((_, i) => {
        if (response.charCodeAt(i) <= 127) {
            output += response.charAt(i);
        }
    });

    output = output.replace(/\n|\r|\t/g, "");
    output = output.replace(
        /^.*(\{"data":\{"(posts|pages|page|post)":.*\[\]\}\}\}).*$/,
        "$1"
    );

    return JSON.parse(output);
}

async function fetchCMS(
    query = "",
    options: {
        next?: Record<string, unknown>;
    } = {},
    acfClean?: boolean
) {
    const session = await getSessionCookie();
    const headers = {
        "Content-Type": "application/json",
        [sessionHeader]: sessionPrefix + session,
    };

    const res = await fetch(apis.wordPressApiUrl, {
        headers,
        method: "POST",
        body: JSON.stringify({
            query,
        }),
        ...options,
    });

    if (!res.ok) {
        let errorMessage: string;

        try {
            const errorData = await res.json();
            errorMessage = JSON.stringify(errorData, null, 2);
        } catch {
            errorMessage = await res.text();
        }
        logger.error(errorMessage, session, "fetchCMS");
    }

    if (acfClean) {
        const response = await res.text();

        return textResponseToJson(response).data;
    }

    const response = await res.json();

    return response.data;
}

const getReleaseNotes = async () => {
    if (await isMarkdownContentEnabled()) {
        const releases = await loadCollection("releases");

        return releases.map(({ slug, data, body }) => ({
            node: {
                id: slug,
                title: String(data.title ?? ""),
                date: String(data.date ?? ""),
                content: body,
                release: { releaseDate: String(data.date ?? "") },
            },
        })) as ReleaseNode[];
    }

    const data: CMSPostsResponse<ReleaseNode> = await fetchCMS(
        GetReleaseNotesQuery,
        DEFAULT_OPTIONS
    );
    return data.posts.edges || null;
};

const getMissionAndPurposes = async () => {
    if (await isMarkdownContentEnabled()) {
        const parsed = await loadPage("about/our-mission-and-purpose");

        if (!parsed) return [];

        return [
            {
                node: {
                    id: "our-mission-and-purpose",
                    title: String(parsed.data.title ?? ""),
                    date: String(parsed.data.crawled ?? ""),
                    content: parsed.body,
                },
            },
        ] as MissionAndPurposesNode[];
    }

    const data: CMSPostsResponse<MissionAndPurposesNode> = await fetchCMS(
        GetMissionAndPurposesQuery,
        DEFAULT_OPTIONS
    );
    return data?.posts?.edges || null;
};

const getMeetTheTeam = async () => {
    const data: CMSPostsResponse<MeetTheTeamNode> = await fetchCMS(
        GetMeetTheTeamQuery,
        DEFAULT_OPTIONS,
        true
    );

    return data?.posts?.edges || null;
};

const getContributorsAndCollaborators = async () => {
    const data: CMSPostsResponse<ContributorsAndCollaboratorsNode> =
        await fetchCMS(
            GetContributorsAndCollaboratorsQuery,
            DEFAULT_OPTIONS,
            true
        );

    return data?.posts?.edges || null;
};

const getHomePageBanner = async () => {
    const data: CMSPostsResponse<HomepageBannerNode> = await fetchCMS(
        GetHomePageBanner,
        DEFAULT_OPTIONS,
        true
    );

    return substituteEnvLinks(data?.posts?.edges);
};

const linkedItemsFromMarkdown = async (
    collection: "news" | "events",
    categoryName: "News" | "Events"
) => {
    const items = await loadCollection(collection);

    return items.map(({ slug, data, body }) => ({
        node: {
            slug,
            newsFields: {
                id: slug,
                headline: String(data.title ?? ""),
                date: String(data.date ?? ""),
                text: String(data.excerpt ?? body),
                link: {
                    url: String(data.external_url ?? ""),
                    title: String(data.source ?? data.title ?? ""),
                },
                image: {
                    node: {
                        mediaItemUrl: toPublicAssetUrl(String(data.image ?? "")),
                        altText: String(data.title ?? ""),
                    },
                },
            },
            categories: { nodes: [{ name: categoryName }] },
        },
    }));
};

const getNews = async () => {
    if (await isMarkdownContentEnabled()) {
        return (await linkedItemsFromMarkdown("news", "News")) as NewsNode[];
    }

    const data: CMSPostsResponse<NewsNode> = await fetchCMS(
        GetNewsQuery,
        DEFAULT_OPTIONS,
        true
    );

    return substituteEnvLinks(data?.posts?.edges);
};

const getEvents = async () => {
    if (await isMarkdownContentEnabled()) {
        return (await linkedItemsFromMarkdown(
            "events",
            "Events"
        )) as EventNode[];
    }

    const data: CMSPostsResponse<EventNode> = await fetchCMS(
        GetEventsQuery,
        DEFAULT_OPTIONS,
        true
    );

    return substituteEnvLinks(data?.posts?.edges);
};

/** content/news/ tagged "News", content/events/ tagged "Events" — matches how
 * article pages check `hasCategoryName(cmsPost.categories, "News"/"Events")`. */
const findPostBySlug = async (slug: string) => {
    const collections: ["news" | "events", "News" | "Events"][] = [
        ["news", "News"],
        ["events", "Events"],
    ];

    for (const [collection, categoryName] of collections) {
        const items = await loadCollection(collection);
        const entry = items.find(item => item.slug === slug);

        if (entry) return toPageTemplateDefault(slug, entry, categoryName);
    }

    return null;
};

const getContentPostQuery = async (
    queryName: string,
    queryOptions: ContentPageQueryOptions
) => {
    if (await isMarkdownContentEnabled()) {
        return findPostBySlug(queryOptions.id ?? queryOptions.name ?? "");
    }

    const data: CMSPostResponse<PageTemplateDefault> = await fetchCMS(
        GetContentPostQuery(queryName, queryOptions),
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.post);
};

const getContentPageQuery = async (
    queryName: string,
    queryOptions: ContentPageQueryOptions
) => {
    if (await isMarkdownContentEnabled()) {
        const slug = queryOptions.id ?? queryOptions.name ?? "";
        const parsed = await loadPage(slug);

        return parsed ? toPageTemplateDefault(slug, parsed) : null;
    }

    const data: CMSPageResponse<PageTemplateDefault> = await fetchCMS(
        GetContentPageQuery(queryName, queryOptions),
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.page);
};

/** WordPress resolved `id` against a flat page namespace, so `parentId` is
 * not needed to disambiguate here — the Markdown fallback used by loadPage
 * (recursive basename search) mirrors that flat lookup. See
 * CONVERSION_PLAN.md for why parentId isn't used to locate the file. */
const getContentPageByParentQuery = async (
    queryName: string,
    queryOptions: ContentPageByParentQueryOptions
) => {
    if (await isMarkdownContentEnabled()) {
        const parsed = await loadPage(queryOptions.id ?? "");

        return parsed
            ? toPageTemplateDefault(queryOptions.id ?? "", parsed)
            : null;
    }

    const parentData: CMSPageResponse<PageTemplateDefault> = await fetchCMS(
        GetContentPageQuery(
            queryName,
            {
                ...queryOptions,
                id: queryOptions.parentId,
            },
            `
                children {
                    nodes {
                        slug
                    }
                }
        `
        ),
        DEFAULT_OPTIONS
    );

    const matchedPage = parentData?.page?.children?.nodes.find(
        ({ slug }) => slug === queryOptions.id
    );

    if (matchedPage) {
        const data: CMSPagesResponse<PageTemplateDefault> = await fetchCMS(
            GetContentPagesByNameQuery(queryName, {
                name: matchedPage.slug,
            }),
            DEFAULT_OPTIONS
        );

        return substituteEnvLinks(data?.pages.nodes[0]);
    }

    return null;
};

const getCohortDiscoverySupportPageQuery = async () => {
    const data: CMSPageResponse<SupportCohortDiscoveryPage> = await fetchCMS(
        GetCohortDiscoverySupportPageQuery,
        DEFAULT_OPTIONS,
        true
    );

    return substituteEnvLinks(data?.page);
};

const getCohortDiscovery = async () => {
    const data: CMSPageResponse<PageTemplatePromo> = await fetchCMS(
        GetCohortDiscoveryQuery,
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.page);
};

const getNewCohortDiscovery = async () => {
    const data: CMSPageResponse<CohortDiscoveryTemplate> = await fetchCMS(
        GetNewCohortDiscoveryQuery,
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.page);
};

/**
 * A partial, best-effort stand-in — not a real conversion. The homepage's
 * ACF fields (`homeFields`: hero video, affiliate link, funder logos,
 * newsletter copy; `meetTheTeam`: the team callout) have no equivalent
 * anywhere in the crawled Markdown, so they're left blank/empty rather than
 * invented. `HTMLVideoEmbed` and `LogoSlider` already handle an empty
 * `gatewayVideo`/`logos` gracefully (see their own components), so this
 * renders a real page rather than a placeholder error — just missing the
 * ACF-only sections. `posts.edges` is real: the latest news/events from
 * Markdown, same source `getNews`/`getEvents` use.
 */
const getHomePageFromMarkdown = async (): Promise<PageTemplateHome> => {
    const [news, events] = await Promise.all([
        linkedItemsFromMarkdown("news", "News"),
        linkedItemsFromMarkdown("events", "Events"),
    ]);

    const posts = [...news, ...events]
        .sort((a, b) =>
            dayjs(b.node.newsFields.date).isBefore(a.node.newsFields.date)
                ? -1
                : 1
        )
        .slice(0, 4) as (NewsNode | EventNode)[];

    return {
        page: {
            id: "home",
            title: "Health Data Research Gateway",
            content: "",
            template: {
                homeFields: {
                    newsHeader: "Latest news and events",
                    gatewayVideo: "",
                    gatewayVideoHeader: "",
                    affiliateLink: { url: "", title: "" },
                    logos: [],
                    newsletterSignupHeader: "",
                    newsletterSignupDescription: "",
                },
                meetTheTeam: {
                    sectionName: "Meet the team",
                    title: "",
                    intro: "",
                    image: { node: { altText: "", sourceUrl: "" } },
                },
            },
        },
        posts: { edges: posts },
    };
};

const getHomePage = async () => {
    if (await isMarkdownContentEnabled()) {
        return getHomePageFromMarkdown();
    }

    const data: PageTemplateHome = await fetchCMS(
        GetHomePageQuery,
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data);
};

const getTermsAndConditions = async () => {
    if (await isMarkdownContentEnabled()) {
        return getContentPageQuery("getTermsAndConditions", {
            id: "terms-and-conditions",
            idType: "URI",
        });
    }

    const data: CMSPageResponse<PageTemplateDefault> = await fetchCMS(
        GetTermsAndConditionsQuery,
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.page);
};

const getCohortTermsAndConditions = async () => {
    const data: CMSPageResponse<PageTemplateRepeat> = await fetchCMS(
        GetCohortTermsAndConditionsQuery,
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.page);
};

const getHowToSearchPage = async () => {
    if (await isMarkdownContentEnabled()) {
        return getContentPageQuery("getHowToSearchPage", {
            id: "how-to-search",
            idType: "URI",
        });
    }

    const data: CMSPageResponse<PageTemplateDefault> = await fetchCMS(
        GetHowToSearchQuery,
        DEFAULT_OPTIONS
    );

    return substituteEnvLinks(data?.page);
};

// These previously called `fetchCMS(GetContentPageQuery(...))` directly
// rather than the local `getContentPageQuery` wrapper above, which would have
// bypassed its Markdown branch. Routed through it now — identical behaviour
// on the WordPress path, and picks up the flag for free.
const getWorkWithUs = async () =>
    getContentPageQuery("getWorkWithUs", {
        id: "work-with-us",
        idType: "URI",
    });

const getTechnologyEcosystem = async () =>
    getContentPageQuery("getTechnologyEcosystem", {
        id: "technology-ecosystem",
        idType: "URI",
    });

const getResearchersInnovators = async () =>
    getContentPageQuery("getResearchersInnovatorsQuery", {
        id: "researchers-innovators",
        idType: "URI",
    });

const getDataCustodians = async () =>
    getContentPageQuery("getDataCustodiansQuery", {
        id: "data-custodians",
        idType: "URI",
    });

const getPatientsAndPublic = async () =>
    getContentPageQuery("getPatientsAndPublicQuery", {
        id: "patients-and-public",
        idType: "URI",
    });

const getGlossary = async () =>
    getContentPageQuery("getGlossaryQuery", {
        id: "glossary",
        idType: "URI",
    });

const getGettingStarted = async () =>
    getContentPageQuery("getGettingStartedQuery", {
        id: "data-custodian-getting-started",
        idType: "URI",
    });

const getMetadataOnboarding = async () =>
    getContentPageQuery("getMetadataOnboardingQuery", {
        id: "data-custodian-metadata-onboarding",
        idType: "URI",
    });

const getOpenSourceDevelopment = async () =>
    getContentPageQuery("getOpenSourceDevelopmentQuery", {
        id: "open-source-development",
        idType: "URI",
    });

const getSortedNewsEventsByDate = async (data: (NewsNode | EventNode)[]) =>
    [...data].sort((a, b) => {
        return dayjs(b.node.newsFields.date).isBefore(
            dayjs(a.node.newsFields.date)
        )
            ? -1
            : 1;
    });

const hasCategoryName = async (
    categories: PageTemplateDefault["categories"],
    categoryName: string
) => {
    return !!categories?.nodes?.find(item => item.name === categoryName);
};

const getPrivacyPolicy = async () =>
    getContentPageQuery("getPrivacyPolicyQuery", {
        id: "privacy-policy",
        idType: "URI",
    });

const getCookieNotice = async () =>
    getContentPageQuery("getCookieNoticeQuery", {
        id: "cookie-notice",
        idType: "URI",
    });

export {
    getCohortDiscovery,
    getNewCohortDiscovery,
    getCohortDiscoverySupportPageQuery,
    getCohortTermsAndConditions,
    getContentPageByParentQuery,
    getContentPageQuery,
    getContentPostQuery,
    getCookieNotice,
    getDataCustodians,
    getTechnologyEcosystem,
    getEvents,
    getGettingStarted,
    getGlossary,
    getHomePage,
    getHomePageBanner,
    getHowToSearchPage,
    getMeetTheTeam,
    getMetadataOnboarding,
    getMissionAndPurposes,
    getNews,
    getOpenSourceDevelopment,
    getPatientsAndPublic,
    getPrivacyPolicy,
    getReleaseNotes,
    getResearchersInnovators,
    getSortedNewsEventsByDate,
    getTermsAndConditions,
    getWorkWithUs,
    hasCategoryName,
    substituteEnvLinks,
    getContributorsAndCollaborators,
};
