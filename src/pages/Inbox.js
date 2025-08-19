// src/pages/Inbox.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import supabase from "../supabaseClient";
import "./Inbox.css";

/* ---- DURUM KODLARI (DB ile birebir) ---- */
const STATUS = {
    Yeni: "Yeni",
    SirayaAlindi: "SirayaAlindi",
    IslemeAlindi: "IslemeAlindi",
    TestEdiliyor: "TestEdiliyor",
    Tamamlandi: "Tamamlandi",
};

const STATUS_DISPLAY = {
    [STATUS.Yeni]: "Yeni",
    [STATUS.SirayaAlindi]: "Sıraya Alındı",
    [STATUS.IslemeAlindi]: "İşleme Alındı",
    [STATUS.TestEdiliyor]: "Test Ediliyor",
    [STATUS.Tamamlandi]: "Tamamlandı",
};

const BOARD_COLUMNS = [
    { key: STATUS.Yeni, title: STATUS_DISPLAY[STATUS.Yeni] },
    { key: STATUS.SirayaAlindi, title: STATUS_DISPLAY[STATUS.SirayaAlindi] },
    { key: STATUS.IslemeAlindi, title: STATUS_DISPLAY[STATUS.IslemeAlindi] },
    { key: STATUS.TestEdiliyor, title: STATUS_DISPLAY[STATUS.TestEdiliyor] },
    { key: STATUS.Tamamlandi, title: STATUS_DISPLAY[STATUS.Tamamlandi] },
];

const PILL_COLOR = { P1: "p1", P2: "p2", P3: "p3" };

/* ---- Tek kayıt sıralama: araya yerleştir (lokal) ---- */
const GAP = 1000;
function between(prev, next) {
    const hasPrev = Number.isFinite(prev);
    const hasNext = Number.isFinite(next);
    if (hasPrev && hasNext) return (prev + next) / 2;
    if (hasPrev && !hasNext) return prev + GAP;
    if (!hasPrev && hasNext) return next - GAP;
    return GAP;
}

/* URL’lerin sonundaki ), ].,!?;: gibi işaretleri linke dahil etme */
function linkifyJsx(text) {
    const t = String(text ?? "");
    const re = /(https?:\/\/[^\s<'"\])]+)([)\].,!?;:]*)/g;
    const nodes = [];
    let last = 0, m;
    while ((m = re.exec(t)) !== null) {
        const [full, url, trailing = ""] = m;
        if (m.index > last) nodes.push(<span key={`t${last}`}>{t.slice(last, m.index)}</span>);
        nodes.push(<a key={`a${m.index}`} href={url} target="_blank" rel="noreferrer">{url}</a>);
        if (trailing) nodes.push(<span key={`p${m.index}`}>{trailing}</span>);
        last = m.index + full.length;
    }
    if (last < t.length) nodes.push(<span key={`tend${last}`}>{t.slice(last)}</span>);
    return nodes.length ? nodes : t;
}

/* Açıklamada markdown görselleri (![alt](url)) doğrudan göster + kalan metni linkify et */
function renderDescription(text) {
    const s = String(text ?? "");
    const parts = [];
    let i = 0, m;
    const imgRe = /!\[([^\]]*)\]\((https?:\/\/[^\s<'"\])]+)\)/g;
    while ((m = imgRe.exec(s)) !== null) {
        const [full, alt, src] = m;
        if (m.index > i) parts.push(<span key={`t${i}`}>{linkifyJsx(s.slice(i, m.index))}</span>);
        parts.push(<img key={`img${m.index}`} src={src} alt={alt || "image"} style={{ maxWidth: "100%", borderRadius: 8 }} />);
        i = m.index + full.length;
    }
    if (i < s.length) parts.push(<span key={`tend${i}`}>{linkifyJsx(s.slice(i))}</span>);
    return parts;
}

export default function InboxModern() {
    const navigate = useNavigate();

    const me = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("user_profile") || "{}");
        } catch {
            return {};
        }
    }, []);
    const myEmail = me?.email || "";
    const myName = (me?.kullanici || "").trim();

    const [view, setView] = useState("board"); // "board" | "list"
    const [q, setQ] = useState("");
    const [onlySLA, setOnlySLA] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const [rows, setRows] = useState([]);
    const [active, setActive] = useState(null);

    // Drawer: sadece "kişisel not" düzenlenecek
    const [noteDraft, setNoteDraft] = useState("");
    const [drawerSaving, setDrawerSaving] = useState(false);

    // guard
    useEffect(() => {
        if (!localStorage.getItem("auth_token")) navigate("/login", { replace: true });
    }, [navigate]);

    // data
    useEffect(() => {
        fetchData();
        setDirty(false);
        setMsg("");
        // eslint-disable-next-line
    }, [onlySLA, view]);

    // realtime
    useEffect(() => {
        const channel = supabase
            .channel("talepler-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "talepler" },
                (payload) => setRows((prev) => applyRealtime(prev, payload))
            )
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    // görünüm değişince sırala
    useEffect(() => {
        setRows((prev) => sortRows(prev, view));
    }, [view]);

    // aktif kayıt değiştiğinde not taslağını doldur
    useEffect(() => {
        if (active) setNoteDraft(active.kullanici_notu ?? "");
        else setNoteDraft("");
    }, [active]);

    async function fetchData() {
        if (!myEmail) return;
        setLoading(true);
        setErr("");
        try {
            // SADECE bana atanan kayıtlar
            let query = supabase.from("talepler").select("*").eq("atanan_email", myEmail);

            if (view === "list") {
                query = query
                    .order("atanan_sira", { ascending: true, nullsFirst: false })
                    .order("guncelleme_tarihi", { ascending: false });
            } else {
                query = query
                    .order("kolon_sira", { ascending: true, nullsFirst: true })
                    .order("guncelleme_tarihi", { ascending: false });
            }

            if (onlySLA) {
                const t24 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                query = query.lt("sla_son_tarih", t24).not("durum", "in", '("Tamamlandi","Reddedildi")');
            }

            const { data, error } = await query.limit(500);
            if (error) throw error;
            setRows(sortRows(data || [], view));
        } catch (e) {
            console.error(e);
            setErr("Kayıtlar çekilemedi.");
        } finally {
            setLoading(false);
        }
    }

    /* ---------- helpers ---------- */
    function groupByStatus(items) {
        const map = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, []]));
        items.forEach((i) => {
            (map[i.durum || STATUS.Yeni] ??= []).push(i);
        });
        for (const k of Object.keys(map)) {
            map[k].sort((a, b) => (a.kolon_sira ?? 1e15) - (b.kolon_sira ?? 1e15));
        }
        return map;
    }

    async function updateRow(id, changes) {
        setSaving(true);
        const { error } = await supabase
            .from("talepler")
            .update({ ...changes, guncelleme_tarihi: new Date().toISOString() })
            .eq("id", id)
            .eq("atanan_email", myEmail);
        setSaving(false);
        if (error) {
            console.error("updateRow error", error);
            setErr(error.message || "Güncelleme başarısız.");
            fetchData();
            return false;
        }
        return true;
    }

    /* ---------- DnD: Kanban ---------- */
    async function onBoardDragEnd(result) {
        const { source, destination, draggableId } = result;
        if (!destination) return;

        const byStatus = groupByStatus([...rows]);
        const srcArr = byStatus[source.droppableId];
        const dstArr = byStatus[destination.droppableId];

        const idx = srcArr.findIndex((i) => String(i.id) === String(draggableId));
        if (idx === -1) return;

        const item = srcArr[idx];
        if (item.atanan_email !== myEmail) {
            setErr("Bu kart size ait değil.");
            return;
        }

        // UI
        srcArr.splice(idx, 1);
        const destIndex = destination.index;
        dstArr.splice(destIndex, 0, item);

        const prev = dstArr[destIndex - 1]?.kolon_sira;
        const next = dstArr[destIndex + 1]?.kolon_sira;
        const newKolonSira = between(prev, next);
        const newDurum = destination.droppableId;

        setRows((prevRows) =>
            sortRows(
                prevRows.map((r) => (r.id === item.id ? { ...r, durum: newDurum, kolon_sira: newKolonSira } : r)),
                view
            )
        );
        if (active?.id === item.id) setActive({ ...item, durum: newDurum, kolon_sira: newKolonSira });

        await updateRow(item.id, { durum: newDurum, kolon_sira: newKolonSira });
    }

    /* ---------- DnD: Liste (SADECE Sıraya Alındı) ---------- */
    async function onListDragEnd(result) {
        const { destination, draggableId } = result;
        if (!destination) return;

        // Yalnızca Sıraya Alındı statüsündekiler sıralanabilir
        const listEligible = filteredEligible; // closure'dan
        const from = listEligible.findIndex((i) => String(i.id) === String(draggableId));
        if (from === -1) return; // diğer statüler için sürükleme yok
        const moved = listEligible[from];
        listEligible.splice(from, 1);
        const to = destination.index;
        listEligible.splice(to, 0, moved);

        setRows((prevRows) => {
            const orderMap = new Map(listEligible.map((r, i) => [r.id, i + 1]));
            const nextRows = prevRows.map((r) => (orderMap.has(r.id) ? { ...r, atanan_sira: orderMap.get(r.id) } : r));
            return sortRows(nextRows, view);
        });

        setDirty(true);
        setMsg("Sıraya Alındı listesindeki kişisel sırada kaydedilmemiş değişiklikler var.");
    }

    /* ---------- "Sırayı Kaydet" (kişisel) ---------- */
    async function saveOrder() {
        if (view !== "list") return;

        try {
            setSaving(true);
            setErr("");
            setMsg("");

            const ids = filteredEligible.map((r) => Number(r.id));
            if (ids.length === 0) return;

            const { error } = await supabase.rpc("set_assignee_order", { p_email: myEmail, p_ids: ids });
            if (error) {
                // stored proc yoksa tek tek yaz
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    const { error: upErr } = await supabase
                        .from("talepler")
                        .update({ atanan_sira: i + 1, guncelleme_tarihi: new Date().toISOString() })
                        .eq("id", id)
                        .eq("atanan_email", myEmail)
                        .eq("durum", STATUS.SirayaAlindi);
                    if (upErr) throw upErr;
                }
            }
            setMsg("Sıraya Alındı listesindeki kişisel sıra kaydedildi.");
            setDirty(false);
            await fetchData();
        } catch (e) {
            console.error(e);
            setErr("Sıralama kaydedilemedi.");
        } finally {
            setSaving(false);
        }
    }

    /* ---------- hızlı işlemler ---------- */
    async function moveTo(id, statusKey) {
        const row = rows.find((r) => r.id === id);
        if (!row || row.atanan_email !== myEmail) {
            setErr("Bu kayıt size ait değil.");
            return;
        }

        const byStatus = groupByStatus(rows);
        const dst = byStatus[statusKey];
        const last = dst[dst.length - 1]?.kolon_sira;
        const newKolonSira = between(last, undefined);

        setRows((prevRows) =>
            sortRows(prevRows.map((r) => (r.id === id ? { ...r, durum: statusKey, kolon_sira: newKolonSira } : r)), view)
        );
        if (active?.id === id) setActive((prev) => ({ ...prev, durum: statusKey, kolon_sira: newKolonSira }));

        await updateRow(id, { durum: statusKey, kolon_sira: newKolonSira });
    }

    async function markDone(id) {
        await moveTo(id, STATUS.Tamamlandi);
    }

    function handleLogout() {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user_profile");
        navigate("/login", { replace: true });
    }

    /* ---------- filter ---------- */
    const filtered = rows.filter((r) => {
        if (!q) return true;
        const text = `${r.id} ${r.baslik} ${r.talep_eden_email} ${r.atanan_email || ""} ${r.talep_eden_kullanici || ""} ${r.atanan_kullanici || ""}`.toLowerCase();
        return text.includes(q.toLowerCase());
    });

    // LİSTE görünümü için: yalnızca Sıraya Alındı statüsündekiler sıralanabilir
    const filteredEligible = filtered.filter((r) => r.durum === STATUS.SirayaAlindi);

    const grouped = groupByStatus(filtered);

    /* ---------- drawer: yalnızca notu kaydet ---------- */
    const noteDirty = (active?.kullanici_notu ?? "") !== noteDraft;

    async function saveNote() {
        if (!active) return;
        if (active.atanan_email !== myEmail) {
            setErr("Bu kayıt size ait değil.");
            return;
        }
        try {
            setDrawerSaving(true);
            const ok = await updateRow(active.id, { kullanici_notu: (noteDraft || "").trim() || null });
            if (ok) {
                const nowIso = new Date().toISOString();
                setRows((prev) =>
                    prev.map((r) => (r.id === active.id ? { ...r, kullanici_notu: noteDraft, guncelleme_tarihi: nowIso } : r))
                );
                setActive((prev) => (prev ? { ...prev, kullanici_notu: noteDraft, guncelleme_tarihi: nowIso } : prev));
                setMsg("Not kaydedildi.");
            }
        } catch (e) {
            console.error(e);
            setErr("Not kaydedilemedi.");
        } finally {
            setDrawerSaving(false);
        }
    }

    return (
        <div className="mx">
            <div className="mx-top">
                <div className="brand">
                    <div className="logo">🧭</div>
                    <div className="bt">
                        <h1>Gelen Kutusu</h1>
                        <span className="muted">Sadece size atanan işler</span>
                    </div>
                </div>

                <div className="cmd">
                    <div className="seg">
                        <button className={`seg-btn ${view === "board" ? "on" : ""}`} onClick={() => setView("board")}>
                            Kanban
                        </button>
                        <button className={`seg-btn ${view === "list" ? "on" : ""}`} onClick={() => setView("list")}>
                            Liste
                        </button>
                    </div>

                    <div className="search-wrap">
                        <input
                            className="search"
                            placeholder="Ara: #id, başlık, kişi…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </div>

                    <div className="toggles">
                        <label className="toggle">
                            <input type="checkbox" checked={onlySLA} onChange={(e) => setOnlySLA(e.target.checked)} />
                            <span>SLA (&lt;24s)</span>
                        </label>
                    </div>

                    {view === "list" && (
                        <button
                            className={`btn ${dirty ? "primary" : "ghost"}`}
                            onClick={saveOrder}
                            disabled={!dirty || saving || filteredEligible.length === 0}
                            title="Sıraya Alındı listesindeki kişisel sıranı kaydet"
                        >
                            Sıramı Kaydet
                        </button>
                    )}

                    <Link to="/newrequest" className="btn primary">+ Yeni Talep</Link>
                    <div className="chip">{(me?.kullanici || me?.email) || ""}</div>
                    <button className="btn danger" onClick={handleLogout}>Çıkış</button>
                    {saving && <div className="saving-ind">Kaydediliyor…</div>}
                </div>
            </div>

            {err && <div className="mx-alert err">{err}</div>}
            {msg && !err && <div className="mx-alert ok">{msg}</div>}

            {loading ? (
                <div className="mx-skel">Yükleniyor…</div>
            ) : view === "board" ? (
                <DragDropContext onDragEnd={onBoardDragEnd}>
                    <div className="board">
                        {BOARD_COLUMNS.map((col) => {
                            const items = grouped[col.key] || [];
                            return (
                                <Droppable droppableId={col.key} key={col.key}>
                                    {(provided) => (
                                        <div className="col" ref={provided.innerRef} {...provided.droppableProps}>
                                            <div className="col-head">
                                                <span className={`dot s-${slug(col.title)}`}></span>
                                                <h3>{col.title}</h3>
                                                <span className="count">{items.length}</span>
                                            </div>
                                            <div className="col-body">
                                                {items.length === 0 && <div className="col-empty">Henüz kayıt yok</div>}
                                                {items.map((item, index) => (
                                                    <Draggable
                                                        draggableId={String(item.id)}
                                                        index={index}
                                                        key={item.id}
                                                        isDragDisabled={item.atanan_email !== myEmail}
                                                    >
                                                        {(pp) => (
                                                            <div ref={pp.innerRef} {...pp.draggableProps} {...pp.dragHandleProps}>
                                                                <Card
                                                                    data={item}
                                                                    onOpen={() => setActive(item)}
                                                                    me={myEmail}
                                                                />
                                                            </div>

                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        </div>
                                    )}
                                </Droppable>
                            );
                        })}
                    </div>
                </DragDropContext>
            ) : (
                // LİSTE: yalnızca Sıraya Alındı statüsündekiler sürüklenebilir ve kaydedilebilir
                <DragDropContext onDragEnd={onListDragEnd}>
                    <Droppable droppableId="listEligible">
                        {(provided) => (
                            <div className="listv" ref={provided.innerRef} {...provided.droppableProps}>
                                {filteredEligible.length === 0 && (
                                    <div className="col-empty">Sıraya Alındı statüsünde kayıt yok</div>
                                )}
                                {filteredEligible.map((r, index) => (
                                    <Draggable draggableId={String(r.id)} index={index} key={r.id}>
                                        {(pp) => (
                                            <div
                                                ref={pp.innerRef}
                                                {...pp.draggableProps}
                                                {...pp.dragHandleProps}
                                                className="rowv"
                                                onClick={() => setActive(r)}
                                            >
                                                <span className="r-idx" style={{ minWidth: 24, textAlign: "right", opacity: 0.7, marginRight: 8 }}>
                                                    {r.atanan_sira ?? index + 1}
                                                </span>
                                                <span className={`pill ${PILL_COLOR[r.oncelik] || "p3"}`}>{r.oncelik || "P3"}</span>
                                                <span className={`badge s-${slug(STATUS_DISPLAY[r.durum] || "Yeni")}`}>{STATUS_DISPLAY[r.durum] || "Yeni"}</span>
                                                <span className="r-title">#{r.id} — {r.baslik}</span>
                                                <span className="r-sub">
                                                    {(r.talep_eden_kullanici || r.talep_eden_email) || "—"} → {(r.atanan_kullanici || r.atanan_email) || "—"}
                                                    <b style={{ marginLeft: 8, opacity: 0.8 }}>(Sıra: {r.atanan_sira ?? "—"})</b>
                                                </span>
                                                <span className="r-time">{fmtTime(r.guncelleme_tarihi)}</span>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                                <div className="hint" style={{ padding: 8, opacity: 0.7 }}>
                                    Bu listede yalnızca <b>Sıraya Alındı</b> statüsündeki kayıtları sürükleyerek kişisel kuyruğunu düzenleyebilirsin. Diğer statülerdeki kayıtlar burada sıralanamaz.
                                </div>
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )}

            {/* Detay çekmecesi */}
            {active && (
                <div className="drawer" role="dialog" aria-modal="true">
                    <div className="drawer-backdrop" onClick={() => setActive(null)} />
                    <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
                        <button className="drawer-close" onClick={() => setActive(null)}>×</button>

                        <div className="drawer-top">
                            <span className={`pill ${PILL_COLOR[active.oncelik] || "p3"}`}>{active.oncelik || "P3"}</span>
                            <span className={`badge s-${slug(STATUS_DISPLAY[active.durum] || "Yeni")}`}>{STATUS_DISPLAY[active.durum] || "Yeni"}</span>
                            {active.sla_son_tarih && new Date(active.sla_son_tarih).getTime() - Date.now() < 24 * 60 * 60 * 1000 && <span className="sla">SLA</span>}
                            <h2>#{active.id} — {active.baslik}</h2>
                            <div className="d-sub">
                                <span>İsteyen: <b>{active.talep_eden_kullanici || active.talep_eden_email}</b></span>
                                <span> · </span>
                                <span>Atanan: <b>{active.atanan_kullanici || active.atanan_email || "—"}</b></span>
                                <span> · </span>
                                <span>Güncellendi: {fmtTime(active.guncelleme_tarihi)}</span>
                            </div>
                        </div>

                        <div className="drawer-body">
                            {/* AÇIKLAMA: SALT-OKUNUR + görselleri göster + linkify */}
                            <Section title="Açıklama">
                                <div className="desc" style={{ whiteSpace: "pre-wrap" }}>
                                    {renderDescription(active.aciklama || "Açıklama girilmemiş.")}
                                </div>
                            </Section>

                            {/* KİŞİSEL NOT (KAYDET butonu bu bölümde) */}
                            <Section title="Kişisel Notum">
                                <textarea
                                    className="input texta"
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    placeholder="Bu talep hakkında kendine not bırak… (yalnızca sen görürsün)"
                                    rows={4}
                                />
                                <div className="act-row">
                                    <button
                                        className="btn primary"
                                        onClick={saveNote}
                                        disabled={!noteDirty || drawerSaving}
                                    >
                                        Notu Kaydet
                                    </button>
                                    <button
                                        className="btn ghost"
                                        onClick={() => setNoteDraft(active.kullanici_notu ?? "")}
                                        disabled={!noteDirty || drawerSaving}
                                    >
                                        Geri Al
                                    </button>
                                    {drawerSaving && <span className="saving-ind" style={{ marginLeft: 8 }}>Kaydediliyor…</span>}
                                </div>
                                <div className="muted" style={{ marginTop: 6 }}>
                                    Bu alan <b>kullanici_notu</b> sütununda saklanır ve yalnızca bu işi üstlenen kullanıcı için anlamlıdır.
                                </div>
                            </Section>

                            {/* Hızlı İşlemler: çekmece kapanmadan statü değişir */}
                            <Section title="Hızlı İşlemler">
                                <div className="act-grid">
                                    <button className="btn ghost" onClick={() => moveTo(active.id, STATUS.SirayaAlindi)} disabled={active.atanan_email !== myEmail}>
                                        Sıraya alındı
                                    </button>
                                    <button className="btn ghost" onClick={() => moveTo(active.id, STATUS.IslemeAlindi)} disabled={active.atanan_email !== myEmail}>
                                        İşleme alındı
                                    </button>
                                    <button className="btn ghost" onClick={() => moveTo(active.id, STATUS.TestEdiliyor)} disabled={active.atanan_email !== myEmail}>
                                        Test ediliyor
                                    </button>
                                    <button className="btn primary" onClick={() => markDone(active.id)} disabled={active.atanan_email !== myEmail}>
                                        ✓ Tamamlandı
                                    </button>
                                </div>
                            </Section>

                            <Section title="Zaman">
                                <div className="kv">
                                    <div><span>Hedef Tarih:</span><b>{active.bitis_tarihi ? fmtDate(active.bitis_tarihi) : "—"}</b></div>
                                    <div><span>SLA Son:</span><b>{active.sla_son_tarih ? fmtDate(active.sla_son_tarih) : "—"}</b></div>
                                </div>
                            </Section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* components */
function Card({ data, onOpen, me }) {
    const mine = data.atanan_email && data.atanan_email === me;
    const prio = String(data.oncelik || "P3").toLowerCase(); // p1|p2|p3

    return (
        <div className={`card ${mine ? "mine" : ""} prio-${prio}`} onClick={onOpen}>
            <div className="c-title">#{data.id} — {data.baslik}</div>
            <div className="c-desc">{data.aciklama || "—"}</div>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="sec">
            <div className="sec-h"><h4>{title}</h4></div>
            <div className="sec-b">{children}</div>
        </section>
    );
}

/* utils */
function slug(s) {
    return (s || "")
        .toLowerCase()
        .replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ş", "s")
        .replaceAll("ö", "o").replaceAll("ç", "c").replaceAll("ü", "u")
        .replace(/\s+/g, "-");
}
function fmtTime(ts) { try { return new Date(ts).toLocaleString(); } catch { return "—"; } }
function fmtDate(ts) { try { return new Date(ts).toLocaleDateString(); } catch { return "—"; } }

/* ------ realtime yardımcıları ------ */
function dateNum(v) { try { return new Date(v).getTime() || 0; } catch { return 0; } }

function sortRows(list, view) {
    const a = [...(list || [])];
    if (view === "list") {
        a.sort((x, y) => {
            const ax = x.atanan_sira ?? 1e15;
            const ay = y.atanan_sira ?? 1e15;
            if (ax !== ay) return ax - ay;
            const tx = dateNum(y.guncelleme_tarihi) - dateNum(x.guncelleme_tarihi);
            if (tx !== 0) return tx;
            return (x.id ?? 0) - (y.id ?? 0);
        });
    } else {
        a.sort((x, y) => {
            const kx = x.kolon_sira ?? 1e15;
            const ky = y.kolon_sira ?? 1e15;
            if (kx !== ky) return kx - ky;
            const tx = dateNum(y.guncelleme_tarihi) - dateNum(x.guncelleme_tarihi);
            if (tx !== 0) return tx;
            return (x.id ?? 0) - (y.id ?? 0);
        });
    }
    return a;
}

function applyRealtime(prev, payload) {
    const type = payload.eventType;
    const next = [...prev];

    if (type === "DELETE") {
        return next.filter((r) => r.id !== payload.old?.id);
    }

    const row = payload.new;
    if (row?.atanan_email && prev.length > 0) {
        const myEmail = prev[0]?.atanan_email;
        if (row.atanan_email !== myEmail) return prev;
    }

    const i = next.findIndex((r) => r.id === row.id);
    if (i === -1) next.push(row);
    else next[i] = { ...next[i], ...row };
    return sortRows(next, "board");
}
