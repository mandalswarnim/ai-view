import type { Metadata } from "next";

export const metadata: Metadata = { title: "I viewed this property · AI View" };

export default function ViewedPage() {
  return (
    <>
      <h1>Share photos from your viewing</h1>
      <p>
        Soon you will be able to upload photos you took at a viewing, so other people can compare
        them with the listing&apos;s photos. This is not available yet.
      </p>
    </>
  );
}
