"use client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

// 관리자 전용. BigQuery 데이터를 다시 로드한다.
// 서버 액션으로 인메모리 캐시를 비운 뒤 현재 화면을 새로고침한다.
export function RefreshButton({ action }: { action: () => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      title="BigQuery 데이터를 다시 로드합니다"
      onClick={() =>
        startTransition(async () => {
          await action();
          router.refresh();
        })
      }
    >
      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "새로고침 중" : "데이터 새로고침"}
    </Button>
  );
}
