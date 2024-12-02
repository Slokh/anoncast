"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MobileSidebar } from "@/components/mobile-sidebar";
import React from "react";
import { LiaToriiGateSolid } from "react-icons/lia";
import Link from "next/link";

function MainComponent() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div>
      
      <header className="md:hidden flex h-14 items-center border-b border-white/10 px-4">
        <MobileSidebar />
      </header>

      
      <nav className="hidden md:flex py-3 font-roboto ">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button className="text-gray-400 hover:text-white">
              <i className="fas fa-question-circle text-xl"></i>
            </button>
          </div>

          <div className="flex items-center space-x-6">
            <a href="#" className="text-gray-400 hover:text-white">
              X/Twitter
            </a>
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  className="text-white hover:bg-gray-800 hover:text-white focus:ring-gray-400 group"
                  onMouseEnter={() => setIsOpen(true)}
                  onMouseLeave={() => setIsOpen(false)}
                >
                  Farcaster
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="bg-black m-11 px-4 border-gray-700"
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
              >
                <DropdownMenuItem className="text-white hover:bg-gray-800 focus:bg-gray-800 focus:text-white">
                  @anoncast <LiaToriiGateSolid />
                </DropdownMenuItem>
                <DropdownMenuItem className="text-white  hover:bg-gray-800 focus:bg-gray-800 focus:text-white">
                  <Link href="/anonfun">@anonfun   <LiaToriiGateSolid  className="inline "/></Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <a href="#" className="text-gray-400 hover:text-white">
              Dexscreener
            </a>
            <a href="#" className="text-gray-400 hover:text-white">
              Uniswap
            </a>
            <a href="#" className="text-gray-400 hover:text-white">
              Github
            </a>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default MainComponent;
