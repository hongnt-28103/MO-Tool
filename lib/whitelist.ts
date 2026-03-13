export const PUBLISHER_WHITELIST: Record<string, string> = {
  [process.env.ADMOB_PUB_NAMI ?? "pub-4973559944609228"]: "Nami",
  [process.env.ADMOB_PUB_NASUS ?? "pub-4584260126367940"]: "Nasus",
};

export type ResolveResult =
  | { status: "ok"; publisherId: string; publisherName: string }
  | { status: "no_access"; message: string }
  | { status: "multiple"; message: string; matched: string[] };

export function resolvePublisher(accounts: Array<{ publisherId: string; name?: string }>): ResolveResult {
  const matched = accounts.filter(
    (a) => PUBLISHER_WHITELIST[a.publisherId] !== undefined
  );
  if (matched.length === 0) {
    return {
      status: "no_access",
      message:
        "Email này chưa được share quyền vào publisher nào trong whitelist (Nami/Nasus). Liên hệ admin AdMob.",
    };
  }
  if (matched.length > 1) {
    console.error("[ADMOB_WHITELIST] Multiple publishers matched:", {
      matchedIds: matched.map((a) => a.publisherId),
      timestamp: new Date().toISOString(),
    });
    return {
      status: "multiple",
      matched: matched.map((a) => a.publisherId),
      message:
        "Phát hiện bất thường: email có quyền vào nhiều publisher trong whitelist. Write bị chặn. Liên hệ admin kiểm tra cấu hình.",
    };
  }
  return {
    status: "ok",
    publisherId: matched[0].publisherId,
    publisherName: PUBLISHER_WHITELIST[matched[0].publisherId],
  };
}

// New function to auto-detect publisher based on email
export function resolvePublisherByEmail(email: string): { publisherId: string; publisherName: string } | null {
  const lowerEmail = email.toLowerCase();
  if (lowerEmail.includes("nami") || lowerEmail.includes("@nami")) {
    return {
      publisherId: process.env.ADMOB_PUB_NAMI ?? "pub-4973559944609228",
      publisherName: "Nami",
    };
  }
  if (lowerEmail.includes("nasus") || lowerEmail.includes("@nasus")) {
    return {
      publisherId: process.env.ADMOB_PUB_NASUS ?? "pub-4584260126367940",
      publisherName: "Nasus",
    };
  }
  return null;
}
