import { useMemo, useState, type ReactNode } from "react";
import type { LearningCourse, Page } from "../../shared/learning";
import { Button, Card, EmptyState, ErrorState, LoadingState, gradeOf, initials } from "./ui";
import { Icon, type IconName } from "./icons";
import { Pager, Search, Status, useData } from "./learning";

const gradeOrder = ["X", "XI", "XII", "Lainnya"];
const gradeKey = (className: string) => gradeOf(className).toLowerCase();

// The course catalog shared by Pembelajaran and Kehadiran: counters, grade pills, filters,
// and grade-accented tiles grouped by grade. Each page decides where a tile leads and which
// badge it shows (publication status by default).
export function CourseCatalog({ endpoint, href, openLabel, badge, emptyIcon, emptyDescription, stats = false, onExpired }: {
  endpoint: string;
  href: (course: LearningCourse) => string;
  openLabel: (course: LearningCourse) => string;
  badge?: (course: LearningCourse) => ReactNode;
  emptyIcon: IconName;
  emptyDescription: string;
  stats?: boolean;
  onExpired: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("all");
  const [publication, setPublication] = useState("all");
  const [sort, setSort] = useState("name");
  const { data, error, retry } = useData<Page<LearningCourse>>(`${endpoint}?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  const manages = (data?.items ?? []).some(course => course.canManage);
  const matching = useMemo(() => (data?.items ?? []).filter(course => publication === "all" || (publication === "published" ? course.published : !course.published)), [data, publication]);
  const visibleCourses = useMemo(() => {
    const filtered = matching.filter(course => grade === "all" || gradeOf(course.className) === grade);
    return [...filtered].sort((a, b) => sort === "class" ? a.className.localeCompare(b.className, "id") || a.name.localeCompare(b.name, "id") : a.name.localeCompare(b.name, "id"));
  }, [matching, grade, sort]);
  const groups = useMemo(() => gradeOrder.map(value => ({ value, courses: visibleCourses.filter(course => gradeOf(course.className) === value) })).filter(group => group.courses.length), [visibleCourses]);
  const gradeCount = (value: string) => matching.filter(course => gradeOf(course.className) === value).length;
  const classCount = new Set(visibleCourses.map(course => course.className)).size;
  const publishedCount = visibleCourses.filter(course => course.published).length;
  const filtered = grade !== "all" || publication !== "all";
  const pickGrade = (value: string) => { setGrade(value); setOffset(0); };
  const resetFilters = () => { setGrade("all"); setPublication("all"); setSort("name"); };
  return <>
    {stats && data && <div className="summary-grid catalog-stats">
      <Card className="stat-card"><span className="stat-icon stat-blue" aria-hidden="true"><Icon name="book" size={20} /></span><div><span className="summary-label">Course tersedia</span><strong className="summary-value">{visibleCourses.length}</strong><p>Dalam hasil pencarian dan filter.</p></div></Card>
      <Card className="stat-card"><span className="stat-icon stat-purple" aria-hidden="true"><Icon name="users" size={20} /></span><div><span className="summary-label">Kelas aktif</span><strong className="summary-value">{classCount}</strong><p>Kelas unik yang memiliki course.</p></div></Card>
      <Card className="stat-card"><span className="stat-icon stat-gold" aria-hidden="true"><Icon name="success" size={20} /></span><div><span className="summary-label">Course terbit</span><strong className="summary-value">{publishedCount}</strong><p>Sudah dapat diakses santri.</p></div></Card>
    </div>}
    <Card><div className="card-heading catalog-heading"><h2>Course Anda</h2><div className="card-tools"><Search change={value => { setQ(value); setOffset(0); }} />
      {manages && <label className="catalog-filter"><span className="visually-hidden">Filter status course</span><select className="input filter-select" value={publication} onChange={event => { setPublication(event.target.value); setOffset(0); }}><option value="all">Semua status</option><option value="published">Terbit</option><option value="draft">Draft</option></select></label>}
      <label className="catalog-filter"><span className="visually-hidden">Urutkan course</span><select className="input filter-select" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Nama A–Z</option><option value="class">Kelas A–Z</option></select></label>
      {(filtered || sort !== "name") && <Button className="button-secondary button-small" onClick={resetFilters}>Atur ulang</Button>}</div></div>
      {data && <div className="filter-bar segmented-bar"><div className="segmented" role="group" aria-label="Filter tingkat kelas">{["all", ...gradeOrder.slice(0, 3)].map(value => <button type="button" key={value} className={`segmented-option ${grade === value ? "is-active" : ""}`} aria-pressed={grade === value} onClick={() => pickGrade(value)}>{value === "all" ? "Semua tingkat" : `Kelas ${value}`}<span className="segmented-count">{value === "all" ? matching.length : gradeCount(value)}</span></button>)}</div></div>}
      {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !visibleCourses.length ? <EmptyState icon={emptyIcon} title="Tidak ada course" description={q || filtered ? "Coba ubah pencarian atau filter Anda." : emptyDescription} action={filtered ? <Button className="button-secondary button-small" onClick={resetFilters}>Atur ulang filter</Button> : undefined} />
        : <div className="catalog-groups">{groups.map(group => <section className="catalog-group" key={group.value}><div className="catalog-group-heading"><span className={`grade-chip grade-chip-${group.value.toLowerCase()}`}>Kelas {group.value}</span><span className="catalog-group-count">{group.courses.length} course</span></div>
          <div className="course-grid">{group.courses.map(course => <a className={`course-tile catalog-tile grade-accent-${gradeKey(course.className)}`} href={href(course)} key={course.id}><div className="learning-row"><span className={`course-avatar course-avatar-${gradeKey(course.className)}`} aria-hidden="true">{initials(course.name)}</span>{badge ? badge(course) : <Status published={course.published} />}</div><h3>{course.name}</h3><p><span className={`grade-chip grade-chip-${gradeKey(course.className)}`}>{course.className}</span> {course.term} · {course.year}</p><span className="course-open">{openLabel(course)}<Icon name="arrowRight" /></span></a>)}</div></section>)}</div>}
      {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
    </Card>
  </>;
}
