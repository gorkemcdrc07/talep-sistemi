// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Inbox from "./pages/Inbox";
import NewRequest from "./pages/NewRequest";
import Requests from "./pages/Requests";

function RequireAuth({ children }) {
    const isAuthed = !!localStorage.getItem("auth_token");
    return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Login sayfası: her zaman login göster */}
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

                {/* Bilinmeyen rota -> login */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
