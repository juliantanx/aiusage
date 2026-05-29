/// <reference types="@sveltejs/kit" />

declare namespace App {
  interface Locals {
    user: {
      id: string
      username: string
      email: string
      display_name: string
      avatar_url: string | null
      role: string
      status: string
    } | null
  }
}
