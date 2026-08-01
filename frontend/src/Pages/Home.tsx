import React from "react";
import logo from "../Images/medicine-bottle.png";
import "./Home.css";
import leaf from "../Images/leaf.png";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";
import { PublicHeader } from "../Components/PublicHeader";

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();


  const handleGetStarted = () => {
    if (!user) {
      navigate("/login",{state:{redirectTo:true}});
      return;
    }

    // Navigate based on role (case-insensitive comparison)
    const role = user.role?.toLowerCase();
    if (role === "admin") navigate("/admin");
    else if (role === "pharmacist") navigate("/pharmacist");
    else if (role === "storagemanager") navigate("/storage");
    else navigate("/"); // fallback for unknown roles
  };


  return (
    <div className="relative bg-homepage min-h-screen text-white px-4 sm:px-6 md:px-14">
      <PublicHeader active="products" />
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
          <div className="md:pl-6 lg:pl-12 xl:pl-20 relative -translate-y-4 md:-translate-y-12">
            <h1 className="font-extrabold text-[32px] sm:text-[44px] md:text-[72px] leading-[1.1]">
              <span className="sm:whitespace-nowrap">Pharmacy Stock</span>
              <br />
              Management.
            </h1>

            <p className="text-gray-200/80 mt-4 max-w-[420px] text-base md:text-lg">
              <span className="sm:whitespace-nowrap">Control your pharmacy stock</span>
              <br />
              without stress or confusion.
            </p>

            <div className="mt-4">
              <button
                onClick={handleGetStarted}
                className="inline-block bg-[#003465] hover:bg-[#00274d] text-white font-bold py-4 px-8 text-xl sm:py-5 sm:px-10 sm:text-2xl rounded-lg shadow-lg"
              >
                Get Started
              </button>
            </div>
          </div>

          <div className="relative flex justify-center md:justify-end items-center">
            <img
              src={logo}
              alt="Medicine bottle"
              className="w-[180px] sm:w-[260px] md:w-[320px] lg:w-[380px] transform rotate-60 drop-shadow-2xl transition-transform duration-500 hover:-rotate-3 hover:scale-105"
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
