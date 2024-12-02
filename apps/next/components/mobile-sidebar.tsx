"use client"

import * as React from "react"
import { FaGithub} from "react-icons/fa";
import { CiTwitter } from "react-icons/ci";

import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

const links = [
  {
    title: "X/Twitter",
    href: "#",
    icon: CiTwitter,
  },
  {
    title: "@anoncast",
    href: "#",
  },
  {
    title: "@anonfun", 
    href: "#",
  },
  {
    title: "Dexscreener",
    href: "#",
  },
  {
    title: "Uniswap",
    href: "#",
  },
  {
    title: "Github",
    href: "#",
    icon: FaGithub
  }
]

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" className="md:hidden">
          <span className="sr-only">Toggle menu</span>
          <svg
            xmlns="http://www.w3.org/2000/svg" 
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] bg-black p-0">
        <nav className="flex flex-col space-y-2 p-4">
          {links.map((link) => {
            const Icon = link.icon
            return (
              <a
                key={link.title}
                href={link.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-white hover:bg-white/10"
              >
                {Icon && <Icon className="h-5 w-5" />}
                {link.title}
              </a>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

