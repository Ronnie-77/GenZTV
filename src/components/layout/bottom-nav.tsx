'use client'

import { useAppStore, type PageName } from '@/lib/store'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'
import { Home, Tv, Search, Heart, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const bottomNavItems: { icon: React.ElementType; label: string; page: PageName }[] = [
  { icon: Home, label: 'Home', page: 'home' },
  { icon: Tv, label: 'Channels', page: 'live' },
  { icon: Search, label: 'Search', page: 'search' },
  { icon: Heart, label: 'Favorites', page: 'favorites' },
  { icon: User, label: 'Account', page: 'more' },
]

export function BottomNav() {
  const { currentPage, setCurrentPage } = useAppStore()
  const { user, isLoggedIn } = useAuth()

  const handleNavClick = (page: PageName) => {
    setCurrentPage(page)
    // If clicking search, focus the search page's input after a small delay
    // (the input only exists once the search view has rendered). On mobile
    // the top nav no longer has a search bar — the dedicated search page IS
    // the search entry point.
    if (page === 'search') {
      setTimeout(() => {
        const searchInput = document.getElementById(
          'search-page-input'
        ) as HTMLInputElement | null
        if (searchInput) {
          searchInput.focus()
          // For mobile, also try to scroll the input into view in case the
          // on-screen keyboard would cover it.
          searchInput.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      }, 120)
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass bg-background/95 md:bg-background/80 border-t border-border lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {bottomNavItems.map((item, index) => {
          const Icon = item.icon
          const isLastItem = index === bottomNavItems.length - 1
          const isActive = currentPage === item.page || 
            (item.page === 'more' && ['more', 'admin'].includes(currentPage))
          
          // For the last item (Account/User), show the signed-in user's
          // Google profile photo. When not signed in, the generic User icon
          // (from the items array above) is rendered by the fallback branch.
          if (isLastItem && isLoggedIn && user) {
            return (
              <button
                key={item.page}
                onClick={() => handleNavClick(item.page)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-200 min-w-[56px]',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <div className={cn(
                  'p-1 rounded-full transition-all duration-200',
                  isActive && 'bg-[#E8E8ED] dark:bg-[#3A3A3C]'
                )}>
                  <Avatar className={cn(
                    'h-6 w-6 ring-2 ring-primary/20 transition-all duration-200',
                    isActive && 'ring-primary/40'
                  )}>
                    {/* referrerPolicy="no-referrer" is required for Google
                        profile photo URLs (lh3.googleusercontent.com) which
                        otherwise may 403 when the request originates from a
                        different origin. */}
                    <AvatarImage
                      src={user.picture}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <span className={cn('text-[10px] font-medium max-w-[64px] truncate', isActive && 'text-foreground font-semibold')}>
                  {user.name.split(' ')[0]}
                </span>
              </button>
            )
          }
          
          return (
            <button
              key={item.page}
              onClick={() => handleNavClick(item.page)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-200 min-w-[56px]',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'p-1.5 rounded-xl transition-all duration-200',
                isActive && 'bg-[#E8E8ED] dark:bg-[#3A3A3C]'
              )}>
                <Icon className={cn('h-5 w-5', isActive && 'text-foreground')} />
              </div>
              <span className={cn('text-[10px] font-medium', isActive && 'text-foreground font-semibold')}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
