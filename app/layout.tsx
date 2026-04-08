import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuestionVault — Drive to Sheet Tracker",
  description: "Parse Google Drive question documents and track production status in Google Sheets. Manage MCQ, True/False and Multi-Correct questions with Pending, Review, and Complete statuses.",
  keywords: "google drive parser, question tracker, google sheets, production status, MCQ tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
