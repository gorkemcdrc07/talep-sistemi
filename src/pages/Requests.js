// src/pages/Requests.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Requests.css";

const STATUS_LABEL = {
    Yeni: "Yeni",
    SirayaAlindi: "Sıraya Alındı",
    IslemeAlindi: "İşleme Alındı",
    TestEdiliyor: "Test Ediliyor",
    Tamamlandi: "Tamamlandı",
};

// Durumların görünmesi/sıralanması için sabit sıra (Inbox ile uyumlu)
const STATUS_ORDER = ["Yeni", "SirayaAlindi", "IslemeAlindi", "TestEdiliyor", "Tamamlandi"];
const statusRank = (s) => {
    const i = STATUS_ORDER.indexOf(s);
    return i === -1 ? 999 : i;
};

// Bu kullanıcılar için Requests ekranında "Talep Listesi" butonu gösterilir
const INBOX_ALLOWED_USERS = ["GÖRKEM ÇADIRCI", "FURKAN BİLGİLİ", "YAĞIZ EFE BULUTCU"];

export default function Requests() {
    const navigate = useNavigate();

    // profil
    const profile = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("user_profile") || "{}");
        } catch {
            return {};
        }
    }, []);
    const userEmail = profile?.email || "";
    const userName = profile?.kullanici || userEmail;

    // Bu kullanıcılar "Talep Listesi" butonunu görür
    const canSeeInboxButton = INBOX_ALLOWED_USERS.includes((profile?.kullanici || "").trim());

    // state
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [onlyOpen, setOnlyOpen] = useState(false); // tamamlananları gizle

    useEffect(() => {
        // auth yoksa login'e
        if (!localStorage.getItem("auth_token")) {
            navigate("/login", { replace: true });
            return;
        }
        if (userEmail) {
            fetchData();
        } else {
            setLoading(false);
            setError("Kullanıcı e-postası bulunamadı.");
        }
        // eslint-disable-next-line
    }, [userEmail, onlyOpen]);

    async function fetchData() {
        try {
            setLoading(true);
            setError("");

            let query = supabase
                .from("talepler")
                .select(`
          id, baslik, aciklama, oncelik, durum,
          talep_eden_email, atanan_email,
          guncelleme_tarihi, bitis_tarihi, sla_son_tarih,
          kolon_sira, atanan_sira, global_sira,
          talep_eden_kullanici, atanan_kullanici
        `)
                .eq("talep_eden_email", userEmail);

            if (onlyOpen) {
                // Tamamlandi/Reddedildi dışındakiler
                query = query.not("durum", "in", '("Tamamlandi","Reddedildi")');
            }

            // Sunucu tarafında kaba bir sıralama
            query = query.order("guncelleme_tarihi", { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            setRows(data || []);
        } catch (err) {
            console.error("fetch error (Supabase):", err);
            setError("Talepler alınamadı.");
        } finally {
            setLoading(false);
        }
    }

    // Arama filtresi
    const filtered = rows.filter((r) => {
        if (!q) return true;
        const hay = `${r.id} ${r.baslik} ${r.aciklama || ""} ${r.talep_eden_kullanici || ""} ${r.atanan_kullanici || ""} ${r.durum || ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
    });

    // Sıralama: Durum → (Sıraya Alındı ise) Kişisel sıra → Kolon sırası → Son güncelleme (desc) → id
    function dateNum(v) {
        try {
            return new Date(v).getTime() || 0;
        } catch {
            return 0;
        }
    }
    const sorted = [...filtered].sort((a, b) => {
        const sa = statusRank(a.durum),
            sb = statusRank(b.durum);
        if (sa !== sb) return sa - sb;

        // Yalnızca Sıraya Alındı durumunda atanan_sira ile sırala; diğer durumlarda etkisiz
        const qa = a.durum === "SirayaAlindi" ? (a.atanan_sira ?? 1e9) : 1e9;
        const qb = b.durum === "SirayaAlindi" ? (b.atanan_sira ?? 1e9) : 1e9;
        if (qa !== qb) return qa - qb;

        const ka = a.kolon_sira ?? 1e9;
        const kb = b.kolon_sira ?? 1e9;
        if (ka !== kb) return ka - kb;

        const ta = dateNum(b.guncelleme_tarihi) - dateNum(a.guncelleme_tarihi);
        if (ta !== 0) return ta;

        return (a.id ?? 0) - (b.id ?? 0);
    });

    function fmtDateTime(ts) {
        if (!ts) return "—";
        try {
            return new Date(ts).toLocaleString();
        } catch {
            return ts;
        }
    }

    function handleLogout() {
        const ok = window.confirm("Oturumu kapatmak istediğinize emin misiniz?");
        if (!ok) return;
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user_profile");
        ["nr_title", "nr_desc", "nr_prio", "nr_due", "nr_assignee"].forEach((k) => localStorage.removeItem(k));
        navigate("/login", { replace: true });
    }

    // Sıra No görünümü: yalnızca Sıraya Alındı durumunda göster; aksi halde —
    const renderQueueNo = (r) =>
        r.durum === "SirayaAlindi" && Number.isFinite(Number(r.atanan_sira)) ? r.atanan_sira : "—";

    return (
        <div className="rq">
            {/* Üst bar */}
            <div className="rq-top">
                <div className="brand">
                    <div className="logo">📋</div>
                    <div className="bt">
                        <h1>Taleplerim</h1>
                        <span className="muted">{userName}</span>
                    </div>
                </div>

                <div className="cmd">
                    <div className="search-wrap">
                        <input
                            className="search"
                            placeholder="Ara: #id, başlık, kişi…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </div>

                    {/* Yalnızca yetkili kullanıcılar için Talep Listesi (Inbox) kısayolu */}
                    {canSeeInboxButton && (
                        <Link to="/inbox" className="btn ghost" title="Kendi gelen kutunu aç">
                            Talep Listesi
                        </Link>
                    )}

                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={onlyOpen}
                            onChange={(e) => setOnlyOpen(e.target.checked)}
                        />
                        <span>Devam edenler</span>
                    </label>

                    <Link to="/newrequest" className="btn primary">
                        + Yeni Talep
                    </Link>

                    {/* Chip + Çıkış — burada görünür */}
                    <div className="chip" title={userEmail}>
                        {userName}
                    </div>
                    <button className="btn danger" onClick={handleLogout}>
                        Çıkış
                    </button>
                </div>
            </div>

            {/* İçerik */}
            <div className="rq-body">
                {loading && <div className="rq-skel">Yükleniyor…</div>}
                {error && !loading && <div className="rq-alert err">{error}</div>}

                {!loading && !error && sorted.length === 0 && (
                    <div className="empty">
                        <p>Henüz talebiniz yok.</p>
                        <Link to="/newrequest" className="btn primary">
                            Yeni Talep Oluştur
                        </Link>
                    </div>
                )}

                {!loading && !error && sorted.length > 0 && (
                    <div className="card">
                        <table className="rq-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 72 }}>ID</th>
                                    <th>Başlık</th>
                                    <th style={{ width: 120 }}>Durum</th>
                                    <th style={{ width: 90 }}>Öncelik</th>
                                    <th style={{ width: 80 }}>Sıra</th>
                                    <th style={{ width: 200 }}>Atanan</th>
                                    <th style={{ width: 190 }}>Güncelleme</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((r) => (
                                    <tr key={r.id}>
                                        <td className="mono"># {r.id}</td>
                                        <td className="title">{r.baslik}</td>
                                        <td>
                                            <span
                                                className={`badge s-${(STATUS_LABEL[r.durum] || "Yeni")
                                                    .toLowerCase()
                                                    .replace(/\s+/g, "-")}`}
                                            >
                                                {STATUS_LABEL[r.durum] || "Yeni"}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`pill ${String(r.oncelik || "P3").toLowerCase()}`}>
                                                {r.oncelik || "P3"}
                                            </span>
                                        </td>
                                        {/* KİŞİSEL SIRA: yalnızca Sıraya Alındı durumunda göster */}
                                        <td className="mono">{renderQueueNo(r)}</td>
                                        <td>{r.atanan_kullanici || r.atanan_email || "—"}</td>
                                        <td className="mono">{fmtDateTime(r.guncelleme_tarihi)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="legend">
                            <span className="pill p1">P1</span>
                            <span className="pill p2">P2</span>
                            <span className="pill p3">P3</span>
                            <span className="muted">
                                – Sıralama: Durum → (Sıraya Alındı ise) Kişisel sıra → Kolon sırası → Son güncelleme
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
