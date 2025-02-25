"use client";

import { motion } from "motion/react";
import clsx from "clsx";

interface TabConfig {
  id: string;
  label?: string; // Optional custom label
  badge?: string; // Add badge support
}

interface AnimatedTabsProps {
  tabs: (string | TabConfig)[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  layoutId?: string;
}

export default function AnimatedTabs({
  tabs,
  activeTab,
  onTabChange,
  layoutId = "default-tab",
}: AnimatedTabsProps) {
  function firstLetterUpperCase(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function getTabId(tab: string | TabConfig): string {
    return typeof tab === 'string' ? tab : tab.id;
  }
  
  return (
    <motion.div
  className="gradient-border-wrapper rounded-full flex gap-1 p-1 w-fit bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary"
  layout
  transition={{ duration: 0.0 }}
>
  {tabs.map((tab) => {
    const tabId = getTabId(tab);
    const isActive = activeTab === tabId;

    return (
      <ul
        className={clsx(
          "relative cursor-pointer px-4 py-2 font-semibold transition-colors flex rounded-full",
          isActive ? "text-zinc-900" : "text-zinc-400"
        )}
        tabIndex={0}
        key={tabId}
        onClick={() => onTabChange(tabId)}
      >
        {isActive ? (
          <motion.div
            layoutId={layoutId}
            className="absolute inset-0 rounded-full bg-white"
          />
        ) : null}
        <span className="relative text-inherit flex items-center gap-2">
          {typeof tab === 'string' ? firstLetterUpperCase(tab) : (
            <>
              {tab.label || firstLetterUpperCase(tab.id)}
              {tab.badge && (
                <span className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {tab.badge}
                </span>
              )}
            </>
          )}
        </span>
      </ul>
    );
  })}
</motion.div>

  );
}