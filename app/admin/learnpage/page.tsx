'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/platform/Header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { browserFetcher } from '@/lib/api/core'
import { createClient } from '@/utils/supabase/client'

/**
 * Admin editor for the learn.edutou.in registration landing page.
 *
 * Everything on that page -- text, photos, form options, stats -- comes from
 * GET /api/learn/page, and this screen writes it back with PUT. Photos are
 * uploaded to the public `site-media` storage bucket. The live site refreshes
 * its copy about every 30 seconds.
 */

const LEARN_URL = (process.env.NEXT_PUBLIC_LEARN_URL || 'https://learn.edutou.in').replace(/\/+$/, '')

interface Photo { url: string; alt: string }
interface Stat { value: string; label: string }

interface LearnPageContent {
  seo: { title: string; description: string }
  brand: { name: string; tagline: string; logoUrl: string }
  hero: { eyebrow: string; headlineBefore: string; headlineHighlight: string; headlineAfter: string; subhead: string; imageUrl: string }
  webinar: { title: string; when: string; duration: string; language: string }
  form: {
    title: string; buttonText: string; privacyNote: string; professions: string[]
    successTitle: string; successMessage: string; whatsappGroupUrl: string
  }
  learn: { title: string; points: string[] }
  stats: Stat[]
  institutions: { title: string; names: string[] }
  gallery: { title: string; photos: Photo[] }
  stickyBar: { enabled: boolean; buttonText: string }
}

interface Registration {
  id: string; name: string; email: string; whatsapp: string; profession: string; city: string
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; created_at: string
}

/** Site-relative paths ("/images/x.jpg") live on the learn site; show them from there. */
const previewUrl = (url: string) => (url.startsWith('/') ? `${LEARN_URL}${url}` : url)

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await browserFetcher(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const details = body?.error?.details as { path: string; message: string }[] | undefined
    const detail = details?.length ? `: ${details.map((d) => `${d.path} — ${d.message}`).join('; ')}` : ''
    throw new Error((body?.error?.message ?? `Request failed (${res.status})`) + detail)
  }
  return body as T
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const body = await api<{ data: { publicUrl: string } }>('/api/storage/site-media', { method: 'POST', body: form })
  return body.data.publicUrl
}

export default function AdminLearnPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [content, setContent] = useState<LearnPageContent | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [regCount, setRegCount] = useState(0)
  const [regLoading, setRegLoading] = useState(false)

  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const dirty = content !== null && JSON.stringify(content) !== saved

  const loadContent = useCallback(async () => {
    const body = await api<{ data: { content: LearnPageContent; updatedAt: string | null } }>('/api/learn/page')
    setContent(body.data.content)
    setSaved(JSON.stringify(body.data.content))
    setUpdatedAt(body.data.updatedAt)
  }, [])

  const loadRegistrations = useCallback(async () => {
    setRegLoading(true)
    try {
      const body = await api<{ data: Registration[]; count: number }>('/api/learn/registrations?limit=2000')
      setRegistrations(body.data)
      setRegCount(body.count)
    } catch (e) {
      toast({ title: 'Could not load registrations', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setRegLoading(false)
    }
  }, [toast])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') return router.push('/')
      try {
        await loadContent()
      } catch (e) {
        toast({ title: 'Could not load page content', description: (e as Error).message, variant: 'destructive' })
      }
      loadRegistrations()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const save = async () => {
    if (!content) return
    setSaving(true)
    try {
      const body = await api<{ data: { content: LearnPageContent; updatedAt: string } }>('/api/learn/page', {
        method: 'PUT',
        body: JSON.stringify({ content }),
      })
      setContent(body.data.content)
      setSaved(JSON.stringify(body.data.content))
      setUpdatedAt(body.data.updatedAt)
      toast({ title: 'Saved', description: 'learn.edutou.in will show the changes within about 30 seconds.' })
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const deleteRegistration = async (id: string) => {
    if (!window.confirm('Delete this registration? This cannot be undone.')) return
    try {
      await api(`/api/learn/registrations/${id}`, { method: 'DELETE' })
      setRegistrations((rows) => rows.filter((r) => r.id !== id))
      setRegCount((c) => c - 1)
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' })
    }
  }

  const exportCsv = () => {
    const cols: (keyof Registration)[] = ['created_at', 'name', 'email', 'whatsapp', 'profession', 'city', 'utm_source', 'utm_medium', 'utm_campaign']
    const esc = (v: unknown) => {
      let s = v == null ? '' : String(v)
      // Neutralise spreadsheet formulas in user-supplied cells.
      if (/^[=+\-@]/.test(s) && !/^\+\d+$/.test(s)) s = `'${s}`
      return `"${s.replace(/"/g, '""')}"`
    }
    const csv = [cols.join(','), ...registrations.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `learn-registrations-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /** Immutable update helper: patch one section of the content. */
  const patch = <K extends keyof LearnPageContent>(key: K, value: Partial<LearnPageContent[K]> | LearnPageContent[K]) =>
    setContent((c) => (c ? { ...c, [key]: Array.isArray(value) ? value : { ...(c[key] as object), ...value } } : c))

  return (
    <main className="overflow-hidden bg-slate-50 dark:bg-black reading:bg-amber-50 min-h-screen">
      <Sidebar isOpen={mobileMenuOpen} isMobile onClose={() => setMobileMenuOpen(false)} />
      <Sidebar isOpen={sidebarOpen} />

      <div className={cn('min-h-screen transition-all duration-300', sidebarOpen ? 'md:pl-64' : 'md:pl-0')}>
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} setMobileMenuOpen={setMobileMenuOpen} />

        <div className="p-4 md:p-6 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Learn Page</h1>
              <p className="text-muted-foreground">
                Edit the registration landing page at{' '}
                <a href={LEARN_URL} target="_blank" rel="noreferrer" className="underline">{LEARN_URL.replace(/^https?:\/\//, '')}</a>
                {updatedAt && <> · last saved {new Date(updatedAt).toLocaleString()}</>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={LEARN_URL} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open live page</a>
              </Button>
              <Button variant="outline" disabled={!dirty || saving} onClick={() => saved && setContent(JSON.parse(saved))}>
                <RotateCcw className="mr-2 h-4 w-4" />Discard changes
              </Button>
              <Button disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {dirty ? 'Save changes' : 'Saved'}
              </Button>
            </div>
          </div>

          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content">Page content</TabsTrigger>
              <TabsTrigger value="registrations">Registrations ({regCount})</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-4">
              {!content ? (
                <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <Section title="Hero" description="The headline block at the top of the page.">
                    <TextField label="Badge text" value={content.hero.eyebrow} onChange={(v) => patch('hero', { eyebrow: v })} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <TextField label="Headline (start)" value={content.hero.headlineBefore} onChange={(v) => patch('hero', { headlineBefore: v })} />
                      <TextField label="Highlighted words" value={content.hero.headlineHighlight} onChange={(v) => patch('hero', { headlineHighlight: v })} />
                      <TextField label="Headline (end)" value={content.hero.headlineAfter} onChange={(v) => patch('hero', { headlineAfter: v })} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Preview: {content.hero.headlineBefore} <span className="font-semibold text-orange-600">{content.hero.headlineHighlight}</span> {content.hero.headlineAfter}
                    </p>
                    <TextField label="Sub-heading" multiline value={content.hero.subhead} onChange={(v) => patch('hero', { subhead: v })} />
                    <ImageField label="Hero image (shown on desktop)" value={content.hero.imageUrl} onChange={(v) => patch('hero', { imageUrl: v })} allowEmpty />
                  </Section>

                  <Section title="Webinar details" description="Shown under the headline and in the sticky bar.">
                    <TextField label="Webinar name" value={content.webinar.title} onChange={(v) => patch('webinar', { title: v })} />
                    <TextField label="When" placeholder="e.g. Sat, 7 Dec · 7:00 PM IST" value={content.webinar.when} onChange={(v) => patch('webinar', { when: v })} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Duration" value={content.webinar.duration} onChange={(v) => patch('webinar', { duration: v })} />
                      <TextField label="Language" value={content.webinar.language} onChange={(v) => patch('webinar', { language: v })} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <Label>Sticky "Join now" bar</Label>
                        <p className="text-xs text-muted-foreground">Bottom bar that scrolls visitors to the form.</p>
                      </div>
                      <Switch checked={content.stickyBar.enabled} onCheckedChange={(v) => patch('stickyBar', { enabled: v })} />
                    </div>
                    <TextField label="Sticky bar button" value={content.stickyBar.buttonText} onChange={(v) => patch('stickyBar', { buttonText: v })} />
                  </Section>

                  <Section title="Registration form">
                    <TextField label="Form title" value={content.form.title} onChange={(v) => patch('form', { title: v })} />
                    <TextField label="Button text" value={content.form.buttonText} onChange={(v) => patch('form', { buttonText: v })} />
                    <TextField label="Privacy note" value={content.form.privacyNote} onChange={(v) => patch('form', { privacyNote: v })} />
                    <ListField label="Profession options" items={content.form.professions} onChange={(v) => patch('form', { professions: v })} addLabel="Add option" min={1} />
                    <TextField label="Success title" value={content.form.successTitle} onChange={(v) => patch('form', { successTitle: v })} />
                    <TextField label="Success message" multiline value={content.form.successMessage} onChange={(v) => patch('form', { successMessage: v })} />
                    <TextField label="WhatsApp group link (optional)" placeholder="https://chat.whatsapp.com/…" value={content.form.whatsappGroupUrl} onChange={(v) => patch('form', { whatsappGroupUrl: v })} />
                  </Section>

                  <Section title="What you'll learn">
                    <TextField label="Section title" value={content.learn.title} onChange={(v) => patch('learn', { title: v })} />
                    <ListField label="Points" items={content.learn.points} onChange={(v) => patch('learn', { points: v })} addLabel="Add point" />
                  </Section>

                  <Section title="Stats" description="Up to 6 figures, e.g. 98.7% / Learner satisfaction.">
                    {content.stats.map((s, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <TextField className="w-28" label={i === 0 ? 'Value' : undefined} value={s.value} onChange={(v) => patch('stats', content.stats.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
                        <TextField className="flex-1" label={i === 0 ? 'Label' : undefined} value={s.label} onChange={(v) => patch('stats', content.stats.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
                        <Button variant="ghost" size="icon" aria-label="Remove stat" onClick={() => patch('stats', content.stats.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {content.stats.length < 6 && (
                      <Button variant="outline" size="sm" onClick={() => patch('stats', [...content.stats, { value: '', label: '' }])}><Plus className="mr-1 h-4 w-4" />Add stat</Button>
                    )}
                  </Section>

                  <Section title="Institutions">
                    <TextField label="Section title" value={content.institutions.title} onChange={(v) => patch('institutions', { title: v })} />
                    <ListField label="Names" items={content.institutions.names} onChange={(v) => patch('institutions', { names: v })} addLabel="Add institution" />
                  </Section>

                  <Section title="Photo gallery" description="Drag order with the arrows. JPG, PNG or WebP." className="xl:col-span-2">
                    <TextField label="Section title" value={content.gallery.title} onChange={(v) => patch('gallery', { title: v })} />
                    <GalleryField photos={content.gallery.photos} onChange={(photos) => patch('gallery', { photos })} />
                  </Section>

                  <Section title="Brand">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Name" value={content.brand.name} onChange={(v) => patch('brand', { name: v })} />
                      <TextField label="Tagline" value={content.brand.tagline} onChange={(v) => patch('brand', { tagline: v })} />
                    </div>
                    <ImageField label="Logo" value={content.brand.logoUrl} onChange={(v) => patch('brand', { logoUrl: v })} />
                  </Section>

                  <Section title="Search & sharing" description="Browser tab title and the text shown when the link is shared.">
                    <TextField label="Page title" value={content.seo.title} onChange={(v) => patch('seo', { title: v })} />
                    <TextField label="Description" multiline value={content.seo.description} onChange={(v) => patch('seo', { description: v })} />
                  </Section>
                </div>
              )}
            </TabsContent>

            <TabsContent value="registrations" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Registrations</CardTitle>
                    <CardDescription>{regCount} total{regCount > registrations.length ? ` · showing latest ${registrations.length}` : ''}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadRegistrations} disabled={regLoading}>
                      {regLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}Refresh
                    </Button>
                    <Button size="sm" onClick={exportCsv} disabled={registrations.length === 0}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {registrations.length === 0 ? (
                    <p className="py-10 text-center text-muted-foreground">No registrations yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-muted-foreground">
                          <tr className="border-b">
                            {['Date', 'Name', 'Email', 'WhatsApp', 'Profession', 'City', 'Source', ''].map((h) => (
                              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {registrations.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="whitespace-nowrap px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                              <td className="px-3 py-2 font-medium">{r.name}</td>
                              <td className="px-3 py-2"><a className="underline" href={`mailto:${r.email}`}>{r.email}</a></td>
                              <td className="whitespace-nowrap px-3 py-2"><a className="underline" href={`https://wa.me/${r.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{r.whatsapp}</a></td>
                              <td className="px-3 py-2">{r.profession}</td>
                              <td className="px-3 py-2">{r.city}</td>
                              <td className="px-3 py-2 text-muted-foreground">{[r.utm_source, r.utm_campaign].filter(Boolean).join(' / ') || '—'}</td>
                              <td className="px-3 py-2">
                                <Button variant="ghost" size="icon" aria-label="Delete registration" onClick={() => deleteRegistration(r.id)}><Trash2 className="h-4 w-4" /></Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function Section({ title, description, className, children }: { title: string; description?: string; className?: string; children: ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function TextField({
  label, value, onChange, multiline, placeholder, className,
}: { label?: string; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label>{label}</Label>}
      {multiline ? (
        <Textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

function ListField({
  label, items, onChange, addLabel, min = 0,
}: { label: string; items: string[]; onChange: (v: string[]) => void; addLabel: string; min?: number }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input value={item} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button variant="ghost" size="icon" aria-label="Remove" disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...items, ''])}><Plus className="mr-1 h-4 w-4" />{addLabel}</Button>
    </div>
  )
}

function useUpload() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const upload = async (files: FileList | null, onDone: (urls: string[]) => void) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const urls: string[] = []
      for (const file of Array.from(files)) urls.push(await uploadImage(file))
      onDone(urls)
    } catch (e) {
      toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }
  return { busy, upload }
}

function ImageField({ label, value, onChange, allowEmpty }: { label: string; value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const { busy, upload } = useUpload()
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={previewUrl(value)} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">None</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
            onChange={(e) => { upload(e.target.files, ([url]) => url && onChange(url)); e.target.value = '' }} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1 h-4 w-4" />}Upload
          </Button>
          {allowEmpty && value && <Button variant="ghost" size="sm" onClick={() => onChange('')}>Remove</Button>}
        </div>
      </div>
    </div>
  )
}

function GalleryField({ photos, onChange }: { photos: Photo[]; onChange: (p: Photo[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { busy, upload } = useUpload()
  const move = (i: number, d: -1 | 1) => {
    const next = [...photos]
    const [p] = next.splice(i, 1)
    next.splice(i + d, 0, p!)
    onChange(next)
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {photos.map((p, i) => (
          <div key={`${p.url}-${i}`} className="overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl(p.url)} alt={p.alt} className="aspect-[4/3] w-full object-cover bg-muted" />
            <div className="space-y-2 p-2">
              <Input placeholder="Describe the photo (for accessibility)" value={p.alt}
                onChange={(e) => onChange(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
              <div className="flex justify-between">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Move later" disabled={i === photos.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove photo" onClick={() => onChange(photos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
        onChange={(e) => { upload(e.target.files, (urls) => onChange([...photos, ...urls.map((url) => ({ url, alt: '' }))])); e.target.value = '' }} />
      <Button variant="outline" disabled={busy || photos.length >= 24} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}Add photos
      </Button>
    </div>
  )
}
