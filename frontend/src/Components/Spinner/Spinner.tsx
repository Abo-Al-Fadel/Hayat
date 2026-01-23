
interface SpinenrProps{
    className?: string;
}

const Spinner: React.FC<SpinenrProps> = ({className}) => {
    return (
        <div className={`border-2 border-t-transparent border-white rounded-full animate-spin ${className || "w-5 h-5"}`}>
        </div>    
    );
};
export default Spinner;