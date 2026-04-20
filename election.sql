-- XAMPP-Lite
-- version 8.4.6
-- https://xampplite.sf.net/
--
-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 20, 2026 at 06:13 AM
-- Server version: 11.4.5-MariaDB-log
-- PHP Version: 8.4.6

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `election`
--

-- --------------------------------------------------------

--
-- Table structure for table `admin`
--

CREATE TABLE `admin` (
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `is_open` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

--
-- Dumping data for table `admin`
--

INSERT INTO `admin` (`username`, `password`, `is_open`) VALUES
('admin', '$argon2id$v=19$m=65536,t=3,p=4$0VwuHq1MsBvbf3vGLuN2Qw$W1O2QEv7yhLevHixuqtJwrE82QwbK0jcQQRS896iPu0', 1);

-- --------------------------------------------------------

--
-- Table structure for table `candidates`
--

CREATE TABLE `candidates` (
  `can_id` varchar(10) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `img` varchar(99) NOT NULL,
  `personal_info` text DEFAULT NULL,
  `policy` text DEFAULT NULL,
  `vote_score` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

--
-- Dumping data for table `candidates`
--

INSERT INTO `candidates` (`can_id`, `password`, `name`, `img`, `personal_info`, `policy`, `vote_score`, `is_active`) VALUES
('C001', '$argon2id$v=19$m=65536,t=3,p=4$Rso4oFmofdhUsa0mIPxrrw$4E+FnN8VYEMz3JK8ryHrvcWpGywEpEfmtydLsZ8lJKQ', 'Dr. Anon Meekwamroo', '/img/df15e4b1a897977a0851f29cb0e677b5', 'Graduated Master\'s Degree of Black Magic from Azkaban ', 'Improve university facilities and infrastructure.', 1, 1),
('C002', '$argon2id$v=19$m=65536,t=3,p=4$Rso4oFmofdhUsa0mIPxrrw$4E+FnN8VYEMz3JK8ryHrvcWpGywEpEfmtydLsZ8lJKQ', 'Asst. Prof. Suda Pattana', '', 'Info', 'Expand campus green spaces and sustainability.', 0, 1),
('C003', '$argon2id$v=19$m=65536,t=3,p=4$Rso4oFmofdhUsa0mIPxrrw$4E+FnN8VYEMz3JK8ryHrvcWpGywEpEfmtydLsZ8lJKQ', 'Mr. Prasit Kaona', '', 'Info', 'Renovate digital library systems.', 0, 1),
('C004', '$argon2id$v=19$m=65536,t=3,p=4$k/Crw53zAduS7e/NckSV9w$gRO5JTAUS7uQU9hLHNhQSmvSDyS4JS9eTf7bvYG68Go', 'Assoc. Prof. Somchai Rakdee', '', 'Info', 'Upgrade university internet speed and provide free software licenses for all students.', 0, 1),
('C005', '$argon2id$v=19$m=65536,t=3,p=4$z5N7+awqVloawKQNRwV6JQ$+6OIZ0weqC3UkMCyjCZ57+HaoeRXmH1uCXUOOIAkM3I', 'Beta tester', '', 'Born 2 Chome-34-10 Ebisu, Shibuya, Tokyo 150-0013 Japan\nGraduated from harward in 3 year old', 'สร้าง Death game', 2, 1);

-- --------------------------------------------------------

--
-- Table structure for table `voters`
--

CREATE TABLE `voters` (
  `citizen_id` varchar(13) NOT NULL,
  `laser_id` varchar(97) NOT NULL,
  `name` varchar(30) NOT NULL,
  `has_voted` tinyint(1) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

--
-- Dumping data for table `voters`
--

INSERT INTO `voters` (`citizen_id`, `laser_id`, `name`, `has_voted`, `is_active`) VALUES
('1234', '$argon2id$v=19$m=65536,t=3,p=4$w3NXwIsAc82w+nQTWHXCFQ$GqPJUHxMxf+JZz+4+iVkrKimgJJ/hTohQa/mRi1D2x8', 'tttt', 1, 1),
('1234567890123', '$argon2id$v=19$m=65536,t=3,p=4$x0QGvSMEixgDZERoqZtiNA$8d/qgKRNDMCH+m2pjpunqqAFOqloLxnYY6q6CA0b0vw', 'TESTER', 0, 1),
('2222', '$argon2id$v=19$m=65536,t=3,p=4$YMewE3ibQLm7JAA8GFkMGg$wmVylPVNAa8RERpdAyzMf8Sxme59aqwno1WcdDqCmZQ', 'REINE DE PRETICOR', 1, 1),
('3333', '$argon2id$v=19$m=65536,t=3,p=4$mkGZbVL6gx0+b//O2ysHoA$qOLMF0EYHYRO79LzVeEVjMb9T9cYCUkjcMiajrGszas', 'ALAIN GUILLOTIN', 1, 1),
('4444444444444', '$argon2id$v=19$m=65536,t=3,p=4$qwzaEscLTkZ15/2wAron+w$UE0/5j9jF5Ac78srzVBJ/4Gf/0jf4mFjwPNUfY7cotI', 'GOREG', 0, 1);

-- --------------------------------------------------------

--
-- Table structure for table `votes`
--

CREATE TABLE `votes` (
  `vote_id` int(11) NOT NULL,
  `citizen_id` varchar(13) NOT NULL,
  `can_id` varchar(10) NOT NULL,
  `vote_timestamp` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

--
-- Dumping data for table `votes`
--

INSERT INTO `votes` (`vote_id`, `citizen_id`, `can_id`, `vote_timestamp`) VALUES
(15, '1234', 'C005', '2026-04-13 18:19:57'),
(16, '2222', 'C005', '2026-04-13 20:12:00'),
(17, '3333', 'C001', '2026-04-13 20:18:26');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin`
--
ALTER TABLE `admin`
  ADD PRIMARY KEY (`username`);

--
-- Indexes for table `candidates`
--
ALTER TABLE `candidates`
  ADD PRIMARY KEY (`can_id`);

--
-- Indexes for table `voters`
--
ALTER TABLE `voters`
  ADD PRIMARY KEY (`citizen_id`);

--
-- Indexes for table `votes`
--
ALTER TABLE `votes`
  ADD PRIMARY KEY (`vote_id`),
  ADD UNIQUE KEY `citizen_id` (`citizen_id`),
  ADD KEY `can_id` (`can_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `votes`
--
ALTER TABLE `votes`
  MODIFY `vote_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `votes`
--
ALTER TABLE `votes`
  ADD CONSTRAINT `votes_ibfk_1` FOREIGN KEY (`citizen_id`) REFERENCES `voters` (`citizen_id`),
  ADD CONSTRAINT `votes_ibfk_2` FOREIGN KEY (`can_id`) REFERENCES `candidates` (`can_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
