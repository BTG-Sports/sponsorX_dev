import { SkeletonBlock, SkeletonRows } from "@/components/states";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <SkeletonBlock className="h-10 w-2/3" />
      <SkeletonBlock className="h-4 w-1/2" soft />
      <SkeletonRows rows={4} />
    </div>
  );
}
