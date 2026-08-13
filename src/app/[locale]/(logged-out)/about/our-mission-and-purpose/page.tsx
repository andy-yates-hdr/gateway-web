import { getTranslations } from "next-intl/server";
import Banner from "@/components/Banner";
import Container from "@/components/Container";
import HTMLContent from "@/components/HTMLContent";
import { ABOUT, OUR_MISSION_AND_PURPOSE, PAGES } from "@/consts/translation";
import { getMissionAndPurposes } from "@/utils/cms";
import metaData from "@/utils/metadata";
import "@/styles/wpStyles.css";

export const metadata = metaData({
    title: "Our Mission and Purpose - About",
    description: "",
});

const TRANSLATION_NO_DATA = "noData";

export default async function MissionsPage() {
    const t = await getTranslations(
        `${PAGES}.${ABOUT}.${OUR_MISSION_AND_PURPOSE}`
    );
    const allMissionsAndPurposes = await getMissionAndPurposes();

    return (
        <>
            <Banner title="Our Mission and Purpose" />
            <Container
                sx={{ background: "white", padding: 10 }}
                className="wpStyles">
                <div>
                    {!allMissionsAndPurposes.length && (
                        <p>{t(TRANSLATION_NO_DATA)}</p>
                    )}
                    {allMissionsAndPurposes.map(mission => (
                        <div key={mission.node.title}>
                            <div
                                style={{
                                    fontWeight: "bolder",
                                    fontSize: "16pt",
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: mission.node.title,
                                }}
                            />
                            <HTMLContent content={mission.node.content} />
                        </div>
                    ))}
                </div>
            </Container>
        </>
    );
}
