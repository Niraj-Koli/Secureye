import "vite/modulepreload-polyfill";

import { Navigate, Route, Routes } from "react-router-dom";

import HomePage from "./pages/HomePage";
import ImagePage from "./pages/ImagePage";
import VideoPage from "./pages/VideoPage";
import WebcamPage from "./pages/WebcamPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ResetPage from "./pages/ResetPage";
import PasswordPage from "./pages/PasswordPage";
import ActivationPage from "./pages/ActivationPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
    return (
        <>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="home" element={<Navigate to="/" />} />
                <Route path="image" element={<ImagePage />} />
                <Route path="video" element={<VideoPage />} />
                <Route path="webcam" element={<WebcamPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="signup" element={<SignupPage />} />
                <Route path="reset-password" element={<ResetPage />} />
                <Route
                    path="password/reset/confirm/:uid/:token"
                    element={<PasswordPage />}
                />
                <Route
                    path="activate/:uid/:token"
                    element={<ActivationPage />}
                />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </>
    );
}

export default App;
