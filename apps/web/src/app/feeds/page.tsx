import { redirect } from "next/navigation";

export default function FeedsLegacyPage() {
  redirect("/settings?tab=feeds");
}
