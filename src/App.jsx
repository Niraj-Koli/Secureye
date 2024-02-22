import "vite/modulepreload-polyfill";

import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const HomePage = lazy(() => import("./pages/HomePage"));
const ImagePage = lazy(() => import("./pages/ImagePage"));
const VideoPage = lazy(() => import("./pages/VideoPage"));
const WebcamPage = lazy(() => import("./pages/WebcamPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const ResetPage = lazy(() => import("./pages/ResetPage"));
const PasswordPage = lazy(() => import("./pages/PasswordPage"));
const ActivationPage = lazy(() => import("./pages/ActivationPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const Loading = lazy(() => import("@/components/Elementals/Loading/Loading"));

function App() {
    return (
        <>
            <Suspense fallback={<Loading />}>
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
            </Suspense>
        </>
    );
}

export default App;
