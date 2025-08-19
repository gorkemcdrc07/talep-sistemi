import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import "./Login.css";

export default function Login() {
    const navigate = useNavigate();

    const [mode, setMode] = useState("login"); // "login" | "register"

    // Giriş alanları
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    const [showPw, setShowPw] = useState(false);

    // Kayıt alanları
    const [regEmail, setRegEmail] = useState("");
    const [regPw, setRegPw] = useState("");
    const [regName, setRegName] = useState("");
    const [regBirim, setRegBirim] = useState("");
    const [regTitle, setRegTitle] = useState("");
    const [showRegPw, setShowRegPw] = useState(false);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    // Merkezi bildirim (toast)
    const [notice, setNotice] = useState(null); // { type, title, message }
    const showNotice = (type, message, title = type === "success" ? "Giriş başarılı" : "Hata") => {
        setNotice({ type, title, message });
        window.clearTimeout(showNotice._t);
        showNotice._t = window.setTimeout(() => setNotice(null), 2500);
    };

    function trUp(s) {
        return (s || "").trim().toLocaleUpperCase("tr-TR");
    }

    // === Ortak: profil & yönlendirme ===
    function handlePostAuth(profileData) {
        const isEditor = trUp(profileData.birim) === "İŞ VE SÜREÇ GELİŞTİRME";
        const emailLc = (profileData.email || "").toLowerCase().trim();

        const profile = { ...profileData, email: emailLc, isEditor };

        // auth bilgilerini sakla
        localStorage.setItem("auth_token", "ok-" + Date.now());
        localStorage.setItem("user_profile", JSON.stringify(profile));
        localStorage.setItem("user_email", emailLc); // App.jsx de okuyabilsin diye

        showNotice("success", `Hoş geldin ${profileData.kullanici || profileData.email}!`);

        setTimeout(() => {
            // Kerem özel case -> TeamMonitor
            if (emailLc === "kerem.ozturk@odaklojistik.com.tr") {
                navigate("/teammonitor", { replace: true });
                return;
            }

            // Diğer kullanıcılar
            if (isEditor) {
                navigate("/inbox", { replace: true });
            } else {
                navigate("/requests", { replace: true });
            }
        }, 400);
    }

    // === Giriş ===
    async function handleSubmit(e) {
        e.preventDefault();
        setErr("");

        const emailTrim = (email || "").trim().toLowerCase();
        const pwTrim = (pw || "").trim();
        if (!emailTrim || !pwTrim) {
            showNotice("error", "E-posta ve parola zorunludur");
            return;
        }

        try {
            setLoading(true);

            const { data, error } = await supabase
                .from("login")
                .select("id, email, kullanici, birim, title, sifre")
                .eq("email", emailTrim)
                .maybeSingle();

            if (error) {
                console.error("DB error:", error);
                showNotice("error", "Giriş yapılamadı. Lütfen tekrar deneyin.");
                return;
            }
            if (!data || data.sifre !== pwTrim) {
                showNotice("error", "E-posta veya parola hatalı");
                return;
            }

            handlePostAuth(data);
        } catch (e2) {
            console.error(e2);
            showNotice("error", "Beklenmeyen bir hata oluştu");
        } finally {
            setLoading(false);
        }
    }

    // === Kayıt ===
    async function handleRegister(e) {
        e.preventDefault();
        setErr("");

        const emailTrim = (regEmail || "").trim().toLowerCase();
        const pwTrim = (regPw || "").trim();
        const nameTrim = (regName || "").trim();
        const birimTrim = (regBirim || "").trim();
        const titleTrim = (regTitle || "").trim();

        if (!emailTrim || !pwTrim || !nameTrim || !birimTrim || !titleTrim) {
            showNotice("error", "Tüm alanlar zorunludur");
            return;
        }

        try {
            setLoading(true);

            // 1) Aynı e-posta var mı?
            const { data: existing, error: existErr } = await supabase
                .from("login")
                .select("id")
                .eq("email", emailTrim)
                .maybeSingle();

            if (existErr) {
                console.error("Email check error:", existErr);
                showNotice("error", "Kayıt kontrolü sırasında hata oluştu");
                return;
            }
            if (existing) {
                showNotice("error", "Bu e-posta ile zaten bir hesap var");
                return;
            }

            // 2) Ekle
            const payload = {
                email: emailTrim,
                sifre: pwTrim, // ⚠️ Üretimde hash kullanın (bcrypt vs.)
                kullanici: nameTrim,
                birim: birimTrim,
                title: titleTrim,
            };

            const { data: inserted, error: insertErr } = await supabase
                .from("login")
                .insert([payload])
                .select("id, email, kullanici, birim, title")
                .single();

            if (insertErr) {
                console.error("Insert error:", insertErr);
                showNotice("error", "Kayıt başarısız. Lütfen tekrar deneyin.");
                return;
            }

            // 3) Otomatik giriş + yönlendirme
            showNotice("success", "Kayıt tamamlandı. Giriş yapılıyor…", "Kayıt başarılı");
            handlePostAuth(inserted);
        } catch (e2) {
            console.error(e2);
            showNotice("error", "Beklenmeyen bir hata oluştu");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth">
            <div className="auth-card">
                <div className="brand">
                    <div className="logo" aria-hidden="true">🧭</div>
                    <div className="title">
                        <h1>Talep Sistemi</h1>
                        <p className="muted">Hesabınıza giriş yapın veya kayıt olun</p>
                    </div>
                </div>

                {/* Sekmeler */}
                <div className="tabs" role="tablist" aria-label="Kimlik">
                    <button
                        role="tab"
                        aria-selected={mode === "login"}
                        className={`tab ${mode === "login" ? "active" : ""}`}
                        onClick={() => setMode("login")}
                    >
                        Giriş
                    </button>
                    <button
                        role="tab"
                        aria-selected={mode === "register"}
                        className={`tab ${mode === "register" ? "active" : ""}`}
                        onClick={() => setMode("register")}
                    >
                        Kayıt Ol
                    </button>
                </div>

                {mode === "login" ? (
                    <form onSubmit={handleSubmit} className="form" aria-labelledby="login-tab">
                        <label className="field">
                            <span className="label">E-posta</span>
                            <input
                                type="email"
                                placeholder="ornek@firma.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                className="input"
                                required
                            />
                        </label>

                        <label className="field">
                            <span className="label">Parola</span>
                            <div className="pw">
                                <input
                                    type={showPw ? "text" : "password"}
                                    placeholder="••••••"
                                    value={pw}
                                    onChange={(e) => setPw(e.target.value)}
                                    autoComplete="current-password"
                                    className="input"
                                    required
                                />
                                <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={() => setShowPw((v) => !v)}
                                    aria-label={showPw ? "Parolayı gizle" : "Parolayı göster"}
                                >
                                    {showPw ? "Gizle" : "Göster"}
                                </button>
                            </div>
                        </label>

                        {err && <div className="error">{err}</div>}

                        <button className="primary-btn" disabled={loading}>
                            {loading ? <span className="spinner" /> : "Giriş Yap"}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className="form" aria-labelledby="register-tab">
                        <label className="field">
                            <span className="label">E-posta</span>
                            <input
                                type="email"
                                placeholder="ornek@firma.com"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                autoComplete="email"
                                className="input"
                                required
                            />
                        </label>

                        <label className="field">
                            <span className="label">Parola</span>
                            <div className="pw">
                                <input
                                    type={showRegPw ? "text" : "password"}
                                    placeholder="En az 6 karakter"
                                    value={regPw}
                                    onChange={(e) => setRegPw(e.target.value)}
                                    autoComplete="new-password"
                                    className="input"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={() => setShowRegPw((v) => !v)}
                                    aria-label={showRegPw ? "Parolayı gizle" : "Parolayı göster"}
                                >
                                    {showRegPw ? "Gizle" : "Göster"}
                                </button>
                            </div>
                        </label>

                        <label className="field">
                            <span className="label">Ad Soyad</span>
                            <input
                                type="text"
                                placeholder="Adınız Soyadınız"
                                value={regName}
                                onChange={(e) => setRegName(e.target.value)}
                                className="input"
                                required
                            />
                        </label>

                        <label className="field">
                            <span className="label">Birim</span>
                            <input
                                type="text"
                                placeholder="Örn: İş ve Süreç Geliştirme"
                                value={regBirim}
                                onChange={(e) => setRegBirim(e.target.value)}
                                className="input"
                                required
                            />
                        </label>

                        <label className="field">
                            <span className="label">Title</span>
                            <input
                                type="text"
                                placeholder="Görev Ünvanı"
                                value={regTitle}
                                onChange={(e) => setRegTitle(e.target.value)}
                                className="input"
                                required
                            />
                        </label>

                        {err && <div className="error">{err}</div>}

                        <button className="primary-btn" disabled={loading}>
                            {loading ? <span className="spinner" /> : "Kayıt Ol"}
                        </button>
                    </form>
                )}

                <div className="footer">
                    <span className="muted">© {new Date().getFullYear()} Biriminiz</span>
                </div>
            </div>

            <div className="auth-aside" aria-hidden="false">
                <div className="aside-content">
                    <span className="pill">İŞ VE SÜREÇ GELİŞTİRME</span>
                    <h2>Taleplerinizi buradan iletin</h2>
                    <p>
                        Ekibimize ilettiğiniz talepler; öncelik, durum ve hedef tarihleriyle şeffaf biçimde izlenir.
                        Süreci baştan sona görün, hızla sonuçlandırın.
                    </p>
                    <ul className="benefits">
                        <li><strong>Tek noktadan</strong> talep oluşturma ve takip</li>
                        <li><strong>Gerçek-zamanlı</strong> durum güncellemeleri</li>
                        <li><strong>Standartlaştırılmış</strong> onay akışları</li>
                    </ul>
                    <div className="mini-cta">
                        <span className="dot" /> Destekleyen birim: <b>İş &amp; Süreç Geliştirme</b>
                    </div>
                </div>
            </div>

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
}
