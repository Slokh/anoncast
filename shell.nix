let
  # Pin to nixos-24.11 release
  nixpkgs = fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/nixos-24.11.tar.gz";
  };
  pkgs = import nixpkgs {};
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    # Add other dependencies you might need
  ];
} 