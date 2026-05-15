// @sidebar slot for /article/[id].
//
// Fetches the article's interaction state on the server and hands it to the
// (client) InteractionPanel so the star / read / follow-up toggles + notes
// textarea render directly inside the sidebar's contextual zone. The main
// article body no longer renders these controls — they live here so the
// reading column stays focused on content.

import { fetchArticleInteraction, fetchRankedArticle } from "@/lib/api";
import { InteractionPanel } from "../../../article/[id]/interaction-panel";

export default async function ArticleSidebar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await fetchRankedArticle(id).catch(() => null);
  if (!item) return null;

  const interaction = await fetchArticleInteraction(item.articleId).catch(() => ({
    id: null,
    articleId: item.articleId,
    userId: null,
    viewedAt: null,
    readAt: null,
    starred: false,
    note: null,
    userTags: [] as string[],
    followUp: false,
    readingSeconds: null,
    createdAt: null,
    updatedAt: null,
  }));

  return (
    <div className="px-2 pt-2">
      <InteractionPanel articleId={item.articleId} initialInteraction={interaction} />
    </div>
  );
}
