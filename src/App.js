// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Inbox from "./pages/Inbox";
import NewRequest from "./pages/NewRequest";
import Requests from "./pages/Requests";
import TeamMonitor from "./pages/TeamMonitor";

function getEmailFromStorage() {
    // Bazı projelerde kullanıcı JSON olarak saklanır, bazı projelerde düz string.
    try {
        const userObj = JSON.parse(localStorage.getItem("user") || "{}");
        if (userObj?.email) return String(userObj.email).toLowerCase().trim();
    } catch (_) { }
    const raw = localStorage.getItem("user_email");
    return raw ? String(raw).toLowerCase().trim() : undefined;
}

function RequireAuth({ children }) {
    const token = localStorage.getItem("auth_token");
    const email = getEmailFromStorage();
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    // Kerem ise ve şu an TeamMonitor’da değilse -> yönlendir
    if (email === "kerem.ozturk@odaklojistik.com.tr" && location.pathname !== "/teammonitor") {
        return <Navigate to="/teammonitor" replace />;
    }

    return children;
}

// (opsiyonel) TeamMonitor’a sadece Kerem girsin istiyorsanız:
function RequireKerem({ children }) {
    const email = getEmailFromStorage();
    if (email !== "kerem.ozturk@odaklojistik.com.tr") {
        return <Navigate to="/inbox" replace />;
    }
    return children;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Login */}
                <Route path="/" element={<Login />} />
                <Route path="/login" element={<Login />} />

                {/* Korumalı sayfalar */}
                <Route
                    path="/requests"
                    element={
                        <RequireAuth>
                            <Requests />
                        </RequireAuth>
                    }
                />
                <Route
                    path="/newrequest"
                    element={
                        <RequireAuth>
                            <NewRequest />
                        </RequireAuth>
                    }
                />
                <Route
                    path="/inbox"
                    element={
                        <RequireAuth>
                            <Inbox />
                        </RequireAuth>
                    }
                />

                {/* TeamMonitor */}
                <Route
                    path="/teammonitor"
                    element={
                        <RequireAuth>
                            {/* sadece Kerem erişsin istiyorsanız RequireKerem'i açık bırakın,
                  herkes erişebilsin istiyorsanız <TeamMonitor />'ı direkt verin */}
                            <RequireKerem>
                                <TeamMonitor />
                            </RequireKerem>
                        </RequireAuth>
                    }
                />

                {/* Bilinmeyen rota */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
