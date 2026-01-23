import React from "react";
import logo from "../Images/medicine-bottle.png";
import hayaa from "../Images/HTL.png";
import "./Home.css";
import leaf from "../Images/leaf.png";
import { FaSignOutAlt, FaUserCircle as FaUserCircleRaw } from "react-icons/fa";
import { redirect, useNavigate } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";

export const FaUserCircle = (props: React.SVGProps<SVGSVGElement>) => FaUserCircleRaw(props);

type Props = {};

const Home = (props: Props) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();


  const handleGetStarted = () => {
    if (!user) {
      navigate("/login",{state:{redirectTo:true}});
      return;
    }

    // Navigate based on role
    if (user.role === "admin") navigate("/admin");
    else if (user.role === "pharmacist") navigate("/pharmacist");
    else navigate("/"); // fallback
  };

  const handleProducts = () => {
    handleGetStarted();
  };

  const handleProfile = () => {
    navigate("/login");
  };
  const handleLogout = () => {
    console.log("[AUTH] Logout initiated");
    logout();
    console.log("[AUTH] Token cleared");
    console.log("[AUTH] Redirected to /login");
    navigate("/login", { replace: true });
  };

  return (
    <div className="relative bg-homepage min-h-screen text-white px-6 md:px-14">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between py-6">
        {/* Logo + Name */}
        <div className="flex items-center gap-3 pl-4 md:pl-8">
          <img src={hayaa} alt="Hayaa" className="h-10 w-10 object-contain" />
          <span
            className="exported-logo"
            style={{
              fontFamily: "Winslowtitle Boldnarrow",
              fontSize: "1.75rem",
              color: "white",
              textShadow: "2px 1px 2px rgba(255, 255, 255, 0.31)",
              transform: "translateY(4px)",
            }}
          >
            Hayaa
          </span>
        </div>

        {/* Top-centered navigation */}
        <div className="absolute left-1/2 transform -translate-x-1/2 top-8 flex gap-4">
          <button
            className="px-5 py-2 rounded-full text-sm bg-[#003465] hover:bg-blue-900"
            onClick={handleProducts}
          >
            Products
          </button>
          <button className="px-5 py-2 rounded-full text-sm bg-[#003465] hover:bg-blue-900">
            Contact
          </button>
        </div>

        {/* Profile icon/Logout */}
        <div className="pr-4 md:pr-8">
          {!user?(
          <button onClick={handleProfile}>
            {FaUserCircle({ className: "h-8 w-8 text-[#003465] bg-white rounded-full p1 hover:text-[#00274d]" })}
          </button>
          ) : (
          <button onClick={handleLogout} className="flex items-center gap-2 bg-[#003465] hover:bg-[#00274d] px-3 py-1 rounded-md">
            {FaSignOutAlt({className:"h-6 w-6 text-white/90 "})}
            <span className="text-sm">Logout</span>
            </button>
          )}
        </div>
      </header>
        {/* Slogan under nav */}
        <div className="text-center mt-6 md:mt-10 max-w-lg mx-auto">
        <p className="italic text-gray-200/70 text-xl md:text-2xl font-serif leading-snug md:leading-relaxed relative">
          <span className="absolute -left-2 -top-4 text-5xl md:text-6xl text-gray-400/50 font-serif">“</span>
          We will serve you with our eyelashes
          <span className="absolute -right-2 -bottom-4 text-5xl md:text-6xl text-gray-400/50 font-serif">”</span>
        </p>
        <div className="mt-3 h-1 w-28 bg-gray-400/50 mx-auto rounded-full"></div>
        </div>
      {/* Hero Section */}
      <main className="relative z-20 py-12 md:py-20 ">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 items-center gap-8">
          <div className="md:pl-6 lg:pl-12 xl:pl-20 relative -translate-y-12">
            <h1 className="font-extrabold text-[44px] md:text-[72px] leading-[1.1]">
              <span className="whitespace-nowrap">Pharmacy Stock</span>
              <br />
              Management.
            </h1>

            <p className="text-gray-200/80 mt-4 max-w-[420px] text-base md:text-lg">
              <span className="whitespace-nowrap">Control your pharmacy stock</span>
              <br />
              without stress or confusion.
            </p>

            <div className="mt-4">
              <button
                onClick={handleGetStarted}
                className="inline-block bg-[#003465] hover:bg-[#00274d] text-white font-bold py-5 px-10 text-2xl md:py-5 rounded-lg shadow-lg"
              >
                Get Started
              </button>
            </div>
          </div>

          <div className="relative flex justify-center md:justify-end items-center">
            <img
              src={logo}
              alt="Medicine bottle"
              className="w-[260px] md:w-[320px] lg:w-[380px] transform rotate-60 drop-shadow-2xl transition-transform duration-500 hover:-rotate-3 hover:scale-105"
              style={{ filter: "drop-shadow(-30px 90px 20px rgba(2, 6, 23, 0.24))" }}
            />
          </div>
        </div>

        {/* Decorative leaves */}
        <img src={leaf} alt="leaf left" className="hidden md:block absolute left-6 top-20 w-30 opacity-100 transform -rotate-45 pointer-events-none" />
        <img src={leaf} alt="leaf right" className="hidden md:block absolute right-11 top-2 w-20 opacity-100 transform rotate-6 pointer-events-none" />
        <img src={leaf} alt="leaf left" className="hidden md:block absolute left-16 top-34 w-14 opacity-100 transform -rotate-65 pointer-events-none" />
        <img src={leaf} alt="leaf right" className="hidden md:block absolute right-12 top-41 w-12 opacity-100 transform -rotate-90 pointer-events-none" />
        <img src={leaf} alt="leaf middle" className="hidden md:block absolute left-1/2 top-1/2 w-21 opacity-100 transform -translate-x-1/2 translate-y-1/2 -rotate-45 pointer-events-none" />
      </main>
    </div>
  );
};

export default Home;
