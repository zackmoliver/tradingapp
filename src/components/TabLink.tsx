// src/components/TabLink.tsx
import React from "react";
import { NavLink } from "react-router-dom";

export default function TabLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2 rounded-md text-sm font-medium ${
          isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
