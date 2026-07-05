import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function Shell() {
  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>
      <NavBar />
    </div>
  );
}
