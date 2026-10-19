import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import Login from "./pages/Login.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import ConnectedPages from "./pages/ConnectedPages.tsx";
import CreatePost from "./pages/CreatePost.tsx";
import Calendar from "./pages/Calendar.tsx";
import Queue from "./pages/Queue.tsx";
import MediaLibrary from "./pages/MediaLibrary.tsx";
import Logs from "./pages/Logs.tsx";
import Reports from "./pages/Reports.tsx";
import Settings from "./pages/Settings.tsx";
import Account from "./pages/Account.tsx";
import Diagnostics from "./pages/Diagnostics.tsx";
import AddPage from "./pages/AddPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
      { path: "pages", element: <ProtectedRoute><ConnectedPages /></ProtectedRoute> },
      { path: "pages/add", element: <ProtectedRoute><AddPage /></ProtectedRoute> },
      { path: "create", element: <ProtectedRoute><CreatePost /></ProtectedRoute> },
      { path: "calendar", element: <ProtectedRoute><Calendar /></ProtectedRoute> },
      { path: "queue", element: <ProtectedRoute><Queue /></ProtectedRoute> },
      { path: "media", element: <ProtectedRoute><MediaLibrary /></ProtectedRoute> },
      { path: "logs", element: <ProtectedRoute><Logs /></ProtectedRoute> },
      { path: "reports", element: <ProtectedRoute><Reports /></ProtectedRoute> },
      { path: "settings", element: <ProtectedRoute><Settings /></ProtectedRoute> },
      { path: "account", element: <ProtectedRoute><Account /></ProtectedRoute> },
      { path: "diagnostics", element: <ProtectedRoute><Diagnostics /></ProtectedRoute> },
      { path: "login", element: <Login /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
