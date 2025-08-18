import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import supabase from "../supabaseClient";
import "./NewRequest.css";

const ASSIGNEES = ["GÖRKEM ÇADIRCI", "FURKAN BİLGİLİ", "YAĞIZ EFE BULUTCU"];

// Storage ayarları
const ATTACH_BUCKET = "attachments";
const MAX_FILES = 10;
const MAX_FILE_MB = 15;
const IMAGE_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export default function NewRequest() {
    const navigate = useNavigate();

    // --- auth/profile
    const me = useMemo(() => {
        try { return JSON.parse(localStorage.getItem("user_profile") || "{}"); }
        catch { return {}; }
    }, []);
    const myEmail = me?.email || "";

    // --- guard
    useEffect(() => {
        const token = localStorage.getItem("auth_token");
        if (!token) navigate("/login", { replace: true });
    }, [navigate]);

    // --- form state
    const [title, setTitle] = useState(() => localStorage.getItem("nr_title") || "");
    const [description, setDescription] = useState(() => localStorage.getItem("nr_desc") || "");
    const [priority, setPriority] = useState(() => localStorage.getItem("nr_prio") || "P3");
    const [dueDate, setDueDate] = useState(() => localStorage.getItem("nr_due") || ""); // yyyy-mm-dd
    const [assigneeName, setAssigneeName] = useState(() => localStorage.getItem("nr_assignee") || "");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [notice, setNotice] = useState(null); // {type, title, message}

    // attachments UI state
    const [uploads, setUploads] = useState([]); // [{name,url,path}]
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const descRef = useRef(null);

    // --- draft autosave
    useEffect(() => { localStorage.setItem("nr_title", title); }, [title]);
    useEffect(() => { localStorage.setItem("nr_desc", description); }, [description]);
    useEffect(() => { localStorage.setItem("nr_prio", priority); }, [priority]);
    useEffect(() => { localStorage.setItem("nr_due", dueDate); }, [dueDate]);
    useEffect(() => { localStorage.setItem("nr_assignee", assigneeName); }, [assigneeName]);

    const showNotice = (type, message, title = type === "success" ? "Kayıt oluşturuldu" : "Hata") => {
        setNotice({ type, title, message });
        window.clearTimeout(showNotice._t);
        showNotice._t = window.setTimeout(() => setNotice(null), 2600);
    };

    function clearDraft() {
        ["nr_title", "nr_desc", "nr_prio", "nr_due", "nr_assignee"].forEach(k => localStorage.removeItem(k));
        setUploads([]);
    }

    function computeSLA(prio) {
        // P1=24s, P2=72s, P3=7g
        const now = Date.now();
        const add = prio === "P1" ? 24 * 60 * 60 * 1000 : prio === "P2" ? 72 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        return new Date(now + add).toISOString();
    }

    function toISOEndOfDay(yyyy_mm_dd) {
        if (!yyyy_mm_dd) return null;
        const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
        return new Date(y, m - 1, d, 17, 0, 0).toISOString();
    }

    // login.kullanici -> email
    async function resolveAssigneeEmail(name) {
        const { data, error } = await supabase
            .from("login")
            .select("email")
            .eq("kullanici", name)
            .maybeSingle();
        if (error) throw error;
        return data?.email || null;
    }

    // email -> login.kullanici (talep eden adı için fallback)
    async function resolveDisplayNameByEmail(email) {
        const { data, error } = await supabase
            .from("login")
            .select("kullanici")
            .eq("email", email)
            .maybeSingle();
        if (error) throw error;
        return data?.kullanici || null;
    }

    // ----------------- IMAGE UPLOADS -----------------
    function sanitizeName(name = "") {
        return name
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ş", "s")
            .replaceAll("ö", "o").replaceAll("ç", "c").replaceAll("ü", "u")
            .replace(/[^a-z0-9.\-_]+/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 80);
    }

    async function uploadImage(file) {
        if (!IMAGE_MIME.includes(file.type)) throw new Error("Sadece görsel dosyaları yükleyebilirsiniz.");
        if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Dosya çok büyük (>${MAX_FILE_MB}MB).`);

        const key = `${(myEmail || "anon").split("@")[0]}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeName(file.name)}`;

        const { error: upErr } = await supabase
            .storage
            .from(ATTACH_BUCKET)
            .upload(key, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;

        // public bucket ise:
        const { data } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(key);
        const publicUrl = data?.publicUrl;
        if (!publicUrl) throw new Error("Görsel için public URL alınamadı.");

        return { name: file.name, url: publicUrl, path: key };
    }

    async function handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        const files = Array.from(fileList).slice(0, MAX_FILES - uploads.length);
        if (files.length === 0) return;

        try {
            setUploading(true);
            const results = [];
            for (const f of files) {
                const item = await uploadImage(f);
                results.push(item);
            }
            // açıklamaya markdown olarak ekle
            const md = results.map(r => `![${r.name}](${r.url})`).join("\n");
            setDescription(prev => (prev ? `${prev}\n\n${md}` : md));
            setUploads(prev => [...prev, ...results]);
            showNotice("success", `${results.length} görsel eklendi.`);
        } catch (e) {
            console.error(e);
            showNotice("error", e.message || "Görsel yüklenemedi.");
        } finally {
            setUploading(false);
        }
    }

    function removeAttachment(att) {
        // açıklamadan ilgili markdown'u sil
        const md = `![${att.name}](${att.url})`;
        setDescription(prev => prev.replace(md, "").replace(/\n{3,}/g, "\n\n").trim());
        setUploads(prev => prev.filter(x => x.url !== att.url));
        // (opsiyonel) storage'dan silmek isterseniz:
        // supabase.storage.from(ATTACH_BUCKET).remove([att.path]);
    }

    // textarea'ya görsel yapıştırma
    function onDescPaste(e) {
        const items = e.clipboardData?.items || [];
        const imgs = [];
        for (const it of items) {
            if (it.kind === "file") {
                const f = it.getAsFile();
                if (f && IMAGE_MIME.includes(f.type)) imgs.push(f);
            }
        }
        if (imgs.length) {
            e.preventDefault();
            handleFiles(imgs);
        }
    }

    // drag&drop
    function onDrop(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const dt = ev.dataTransfer;
        if (dt?.files?.length) handleFiles(dt.files);
    }
    function onDragOver(ev) { ev.preventDefault(); }

    // -------------------------------------------------

    async function handleSubmit(e) {
        e.preventDefault();
        setErr("");

        const t = title.trim();
        const desc = description.trim();

        if (!t) return showNotice("error", "Başlık zorunludur.");
        if (!assigneeName) return showNotice("error", "Atanacak kişiyi seçiniz.");
        if (!myEmail) return showNotice("error", "Kullanıcı e-postası bulunamadı.");

        try {
            setLoading(true);

            // Atanacak kişinin e-postasını login tablosundan bul
            const atanan_email = await resolveAssigneeEmail(assigneeName);
            if (!atanan_email) {
                setLoading(false);
                return showNotice("error", "Seçtiğiniz kişi sistemde bulunamadı.");
            }

            // Talep eden adını belirle
            const talep_eden_kullanici =
                (me?.kullanici && String(me.kullanici).trim()) ||
                (await resolveDisplayNameByEmail(myEmail)) ||
                null;

            // --- KUYRUK SIRASI
            const { count: openCount } = await supabase
                .from("talepler")
                .select("*", { count: "exact", head: true })
                .eq("atanan_email", atanan_email)
                .not("durum", "in", ["Tamamlandi", "Reddedildi"]);
            const queuePos = (openCount ?? 0) + 1;

            // --- KOLON SIRASI
            const { data: maxRow } = await supabase
                .from("talepler")
                .select("kolon_sira")
                .eq("durum", "Yeni")
                .order("kolon_sira", { ascending: false })
                .limit(1)
                .maybeSingle();
            const nextKolonSira = (maxRow?.kolon_sira ?? 0) + 1;

            // ---- INSERT
            const row = {
                baslik: t,
                aciklama: desc || null,   // 👈 yüklenen görsellerin markdown’ı da burada
                oncelik: priority,
                durum: "Yeni",
                talep_eden_email: myEmail,
                talep_eden_kullanici,
                atanan_email,
                atanan_kullanici: assigneeName,
                atanan_sira: queuePos,
                kolon_sira: nextKolonSira,
                guncelleme_tarihi: new Date().toISOString(),
                bitis_tarihi: toISOEndOfDay(dueDate),
                sla_son_tarih: computeSLA(priority),
            };

            const { data, error } = await supabase.from("talepler").insert(row).select("*").single();
            if (error) {
                console.error(error);
                return showNotice("error", "Talep kaydedilemedi.");
            }

            clearDraft();
            showNotice(
                "success",
                `#${data.id} oluşturuldu. ${assigneeName} kuyruğunda ${queuePos}. sıradasınız. Yönlendiriliyorsunuz…`
            );
            setTimeout(() => navigate("/requests", { replace: true }), 900);
        } catch (e2) {
            console.error(e2);
            showNotice("error", "Beklenmeyen bir hata oluştu.");
        } finally {
            setLoading(false);
        }
    }

    function handleLogout() {
        const ok = window.confirm("Oturumu kapatmak istediğinize emin misiniz?");
        if (!ok) return;
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user_profile");
        ["nr_title", "nr_desc", "nr_prio", "nr_due", "nr_assignee"].forEach(k => localStorage.removeItem(k));
        navigate("/login", { replace: true });
    }

    return (
        <div className="nr">
            <div className="nr-top">
                <div className="brand">
                    <div className="logo">📝</div>
                    <div className="bt">
                        <h1>Yeni Talep</h1>
                        <span className="muted">İş & Süreç Geliştirme</span>
                    </div>
                </div>

                <div className="cmd">
                    <Link to="/requests" className="btn ghost" title="Taleplerim">📋 Taleplerim</Link>
                    <div className="chip" title={myEmail}>{me?.kullanici || myEmail}</div>
                    <button className="btn danger" onClick={handleLogout} type="button" aria-label="Oturumu kapat">
                        Çıkış
                    </button>
                </div>
            </div>

            {err && <div className="nr-alert err">{err}</div>}

            <form className="nr-form" onSubmit={handleSubmit}>
                <section className="panel main">
                    <div className="row">
                        <label className="lab">Başlık <span className="req">*</span></label>
                        <input
                            className="inp"
                            placeholder="Kısa ve açıklayıcı bir başlık…"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={160}
                            autoFocus
                        />
                    </div>

                    <div className="row">
                        <label className="lab">Açıklama</label>
                        <textarea
                            ref={descRef}
                            className="inp area"
                            placeholder="Beklenen çıktı, gereksinimler, kapsam… (Görseli sürükle-bırak yapabilir veya yapıştırabilirsin)"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            onPaste={onDescPaste}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            rows={10}
                        />
                        <div className="hint">URL ve yerleştirdiğin görseller Markdown olarak eklenir.</div>

                        {/* Görsel yükleme alanı */}
                        <div className="upload-wrap">
                            <div className="drop" onDrop={onDrop} onDragOver={onDragOver}>
                                <div>Görseli buraya sürükle-bırak yap</div>
                                <div>veya</div>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading || uploads.length >= MAX_FILES}
                                >
                                    {uploading ? "Yükleniyor…" : "Dosya Seç"}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={IMAGE_MIME.join(",")}
                                    multiple
                                    hidden
                                    onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
                                />
                                <div className="muted" style={{ marginTop: 8 }}>
                                    En fazla {MAX_FILES} görsel, {MAX_FILE_MB}MB sınırı (png, jpg, webp, gif).
                                </div>
                            </div>

                            {uploads.length > 0 && (
                                <div className="thumbs">
                                    {uploads.map((u) => (
                                        <div className="thumb" key={u.url}>
                                            <a href={u.url} target="_blank" rel="noreferrer">
                                                <img src={u.url} alt={u.name} />
                                            </a>
                                            <div className="thumb-meta">
                                                <span className="name" title={u.name}>{u.name}</span>
                                                <button type="button" className="link danger" onClick={() => removeAttachment(u)}>
                                                    Kaldır
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <aside className="panel side">
                    <div className="g">
                        <label className="lab">Öncelik</label>
                        <div className="prio-seg">
                            {["P1", "P2", "P3"].map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPriority(p)}
                                    className={`seg ${priority === p ? "on" : ""} ${p.toLowerCase()}`}
                                    aria-pressed={priority === p}
                                >{p}</button>
                            ))}
                        </div>
                        <div className="hint">P1: Kritik (24s), P2: Yüksek (72s), P3: Normal (7g).</div>
                    </div>

                    <div className="g">
                        <label className="lab">Hedef Tarih</label>
                        <input type="date" className="inp" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                        <div className="hint">Seçilirse gün sonu 17:00 olarak kaydedilir.</div>
                    </div>

                    <div className="g">
                        <label className="lab">Atanacak Kişi <span className="req">*</span></label>
                        <select className="inp" value={assigneeName} onChange={(e) => setAssigneeName(e.target.value)}>
                            <option value="">Seçiniz…</option>
                            {ASSIGNEES.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <div className="hint">Talebi kime atamak istiyorsunuz?</div>
                    </div>

                    <div className="g">
                        <label className="lab">Talep Sahibi</label>
                        <div className="pill show">{me?.kullanici || myEmail}</div>
                    </div>

                    <div className="g actions">
                        <button className="btn ghost" type="button" onClick={clearDraft}>Taslağı Temizle</button>
                        <button className="btn primary" disabled={loading}>
                            {loading ? "Kaydediliyor…" : "Talebi Oluştur"}
                        </button>
                    </div>
                </aside>
            </form>

            {notice && (
                <div className="toast-wrap" role="status" aria-live="polite">
                    <div className={`toast ${notice.type}`}>
                        <div className="toast-icon" aria-hidden="true">
                            {notice.type === "success" ? "✅" : "⚠️"}
                        </div>
                        <div className="toast-body">
                            <div className="toast-title">{notice.title}</div>
                            <div className="toast-msg">{notice.message}</div>
                        </div>
                        <button className="toast-close" onClick={() => setNotice(null)} aria-label="Kapat">×</button>
                    </div>
                </div>
            )}
        </div>
    );

    // -------------- helpers (submit sonrası) --------------
    async function handleAfterCreate() { /* boş */ }
}
