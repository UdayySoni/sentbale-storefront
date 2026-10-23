import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Section from '@/components/admin/sections';
import { sectionTitles } from '@/lib/admin/nav';

type Props = { params: Promise<{ section: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: sectionTitles[(await params).section] || 'Page not found' };
}
export default async function SectionPage({ params }: Props) {
  const { section } = await params;
  if (!Object.hasOwn(sectionTitles, section)) notFound();
  return <Section section={section} />;
}
